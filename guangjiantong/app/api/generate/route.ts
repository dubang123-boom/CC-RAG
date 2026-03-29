import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { generateDefenseDocument } from '@/lib/claude';
import { checkBudget } from '@/lib/budget';
import { validateGeneratedDocument } from '@/lib/validate';
import { consumeActivationCode } from '@/lib/activation-code';
import type { Analysis } from '@/types';

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { caseId, answers } = await req.json();

  if (!caseId || !answers) {
    return new Response(
      JSON.stringify({ error: 'caseId and answers are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Budget check
  const budget = await checkBudget();
  if (!budget.allowed) {
    return new Response(
      JSON.stringify({ error: '今日 API 调用已达预算上限，请明天再试' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 激活码扣减：在 stream 之前完成，避免扣减失败后已开始生成
  const { data: caseForCode } = await supabaseServer
    .from('gjt_cases')
    .select('activation_code')
    .eq('id', caseId)
    .single();

  const activationCode = caseForCode?.activation_code;
  if (!activationCode) {
    return new Response(
      JSON.stringify({ error: '案件未绑定激活码' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const consumed = await consumeActivationCode(supabaseServer, activationCode);
  if (!consumed) {
    return new Response(
      JSON.stringify({ error: '激活码已用完，请购买新的激活码' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 每 15 秒发送心跳，防止 nginx proxy_read_timeout 断开 SSE 连接
      // 使用 setInterval 确保在 LLM 思考、RAG 检索、DOCX 生成等长时间 await 期间也能发送
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(sseEvent({ type: 'ping' }))); } catch {}
      }, 15000);

      try {
        // 1. Load analysis
        const { data: analysis, error: analysisError } = await supabaseServer
          .from('gjt_analysis')
          .select('*')
          .eq('case_id', caseId)
          .single();

        if (analysisError || !analysis) {
          throw new Error('未找到案件分析结果');
        }

        // 1b. Load original document text
        const { data: caseData } = await supabaseServer
          .from('gjt_cases')
          .select('text_content')
          .eq('id', caseId)
          .single();

        const documentText = caseData?.text_content || '';

        // 2. Update case status
        await supabaseServer
          .from('gjt_cases')
          .update({ status: 'generating' })
          .eq('id', caseId);

        // 3. Save answers to analysis
        await supabaseServer
          .from('gjt_analysis')
          .update({ answers })
          .eq('case_id', caseId);

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'status', message: '正在生成申辩书...' })
        ));

        // 4. Stream generation — collect full markdown
        const typedAnalysis = analysis as unknown as Analysis;
        let fullMarkdown = '';
        for await (const chunk of generateDefenseDocument(typedAnalysis, answers, documentText)) {
          fullMarkdown += chunk;
        }

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'status', message: '正在校验文书质量...' })
        ));

        // 5. Validate and auto-clean generated output
        const hearingEligible = typedAnalysis.hearing_eligible ||
          (typedAnalysis.penalty_amount != null && typedAnalysis.penalty_amount >= 100000);
        const validation = validateGeneratedDocument(fullMarkdown, hearingEligible);

        // Log and send warnings
        if (validation.warnings.length > 0) {
          console.warn(`[validate] ${validation.warnings.length} issue(s):`, validation.warnings);
          for (const w of validation.warnings) {
            controller.enqueue(encoder.encode(
              sseEvent({ type: 'warning', message: w })
            ));
          }
        }

        // 6. Split cleaned output by --- separator into sections
        const sections = validation.cleaned.split(/\n---\n/);
        const statementMd = sections[0]?.trim() || validation.cleaned;
        const evidenceChecklistMd = sections[1]?.trim() || null;
        const hearingApplicationMd = sections[2]?.trim() || null;

        // 7. Generate DOCX (non-blocking — failure is OK, user can print from page)
        const docxPath = `${caseId}/statement.docx`;
        let docxUploaded = false;
        let hearingDocxPath: string | null = null;

        try {
          controller.enqueue(encoder.encode(
            sseEvent({ type: 'status', message: '正在生成 Word 文档...' })
          ));

          const { generateDOCX } = await import('@/lib/docx');
          const docxBuffer = await generateDOCX(statementMd);

          // 8. Upload DOCX to storage (with 1 retry)
          for (let attempt = 0; attempt < 2; attempt++) {
            const { error } = await supabaseServer
              .storage
              .from('gjtong-outputs')
              .upload(docxPath, docxBuffer, {
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                upsert: true,
              });
            if (!error) {
              docxUploaded = true;
              break;
            }
            console.error(`[generate] DOCX upload attempt ${attempt + 1} failed`, {
              caseId,
              bucket: 'gjtong-outputs',
              path: docxPath,
              docxBufferSize: docxBuffer.length,
              errorMessage: error.message,
              errorDetails: error,
            });
          }

          // Generate hearing application DOCX if applicable
          if (hearingApplicationMd) {
            const hearingDocxBuffer = await generateDOCX(hearingApplicationMd);
            const hPath = `${caseId}/hearing.docx`;
            for (let attempt = 0; attempt < 2; attempt++) {
              const { error } = await supabaseServer
                .storage
                .from('gjtong-outputs')
                .upload(hPath, hearingDocxBuffer, {
                  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  upsert: true,
                });
              if (!error) {
                hearingDocxPath = hPath;
                break;
              }
              console.error(`[generate] Hearing DOCX upload attempt ${attempt + 1} failed`, {
                caseId,
                bucket: 'gjtong-outputs',
                path: hPath,
                docxBufferSize: hearingDocxBuffer.length,
                errorMessage: error.message,
                errorDetails: error,
              });
            }
          }
        } catch (docxErr) {
          console.error('[generate] DOCX generation failed (non-fatal)', {
            caseId,
            error: docxErr instanceof Error ? docxErr.message : docxErr,
          });
          controller.enqueue(encoder.encode(
            sseEvent({ type: 'warning', message: 'Word 文档生成失败，您可以从页面直接打印文书' })
          ));
        }

        // 9. Save document record (delete old records, insert version 1 — idempotent)
        await supabaseServer
          .from('gjt_documents')
          .delete()
          .eq('case_id', caseId);

        const { error: docInsertError } = await supabaseServer
          .from('gjt_documents')
          .insert({
            case_id: caseId,
            statement_md: statementMd,
            statement_pdf_path: docxUploaded ? docxPath : null,
            evidence_checklist_md: evidenceChecklistMd,
            hearing_application_md: hearingApplicationMd,
            version: 1,
            supplement_text: null,
          });

        if (docInsertError) {
          console.error('[generate] Failed to save document:', docInsertError);
          throw new Error('保存文书记录失败');
        }

        // 10. Update status to completed
        await supabaseServer
          .from('gjt_cases')
          .update({ status: 'completed' })
          .eq('id', caseId);

        // 11. Generate signed URLs for download
        let docxUrl: string | null = null;
        let hearingDocxUrl: string | null = null;

        if (docxUploaded) {
          const { data: signedData } = await supabaseServer
            .storage
            .from('gjtong-outputs')
            .createSignedUrl(docxPath, 3600); // 1 hour
          docxUrl = signedData?.signedUrl ?? null;
        }

        if (hearingDocxPath) {
          const { data: hearingSignedData } = await supabaseServer
            .storage
            .from('gjtong-outputs')
            .createSignedUrl(hearingDocxPath, 3600);
          hearingDocxUrl = hearingSignedData?.signedUrl ?? null;
        }

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'done', caseId, docxUrl, hearingDocxUrl })
        ));
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成失败';
        console.error('Generate error:', err);

        await supabaseServer
          .from('gjt_cases')
          .update({ status: 'failed', error_message: message })
          .eq('id', caseId);

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'error', message })
        ));
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
