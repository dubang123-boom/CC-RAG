import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { generateComplaintResponse } from '@/lib/claude';
import { checkBudget } from '@/lib/budget';
import { consumeActivationCode } from '@/lib/activation-code';
import type { ComplaintAnalysis } from '@/types';

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

  // 激活码扣减
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
          throw new Error('未找到投诉分析结果');
        }

        // 1b. Load original text
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

        // 3. Save answers
        await supabaseServer
          .from('gjt_analysis')
          .update({ answers })
          .eq('case_id', caseId);

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'status', message: '正在起草回复函...' })
        ));

        // 4. Stream generation — collect full markdown
        const typedAnalysis = analysis as unknown as ComplaintAnalysis;
        let fullMarkdown = '';
        for await (const chunk of generateComplaintResponse(typedAnalysis, answers, documentText)) {
          fullMarkdown += chunk;
        }

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'status', message: '正在生成 Word 文档...' })
        ));

        // 5. Split into three sections
        const sections = fullMarkdown.split(/\n---\n/);
        const responseLetterMd = sections[0]?.trim() || fullMarkdown;
        const negotiationScriptMd = sections[1]?.trim() || null;
        const riskWarningMd = sections[2]?.trim() || null;

        // 6. Generate DOCX for response letter
        const docxPath = `${caseId}/response-letter.docx`;
        let docxUploaded = false;

        try {
          const { generateDOCX } = await import('@/lib/docx');
          const docxBuffer = await generateDOCX(responseLetterMd);

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
            console.error(`[complaint] DOCX upload attempt ${attempt + 1} failed`, {
              caseId,
              errorMessage: error.message,
            });
          }
        } catch (docxErr) {
          console.error('[complaint] DOCX generation failed (non-fatal)', {
            caseId,
            error: docxErr instanceof Error ? docxErr.message : docxErr,
          });
          controller.enqueue(encoder.encode(
            sseEvent({ type: 'warning', message: 'Word 文档生成失败，您可以从页面直接复制或打印' })
          ));
        }

        // 7. Save document record
        await supabaseServer
          .from('gjt_documents')
          .delete()
          .eq('case_id', caseId);

        const { error: docInsertError } = await supabaseServer
          .from('gjt_documents')
          .insert({
            case_id: caseId,
            response_letter_md: responseLetterMd,
            negotiation_script_md: negotiationScriptMd,
            risk_warning_md: riskWarningMd,
            statement_pdf_path: docxUploaded ? docxPath : null,
            version: 1,
          });

        if (docInsertError) {
          console.error('[complaint] Failed to save document:', docInsertError);
          throw new Error('保存文书记录失败');
        }

        // 8. Update status to completed
        await supabaseServer
          .from('gjt_cases')
          .update({ status: 'completed' })
          .eq('id', caseId);

        // 9. Generate signed download URL
        let docxUrl: string | null = null;
        if (docxUploaded) {
          const { data: signedData } = await supabaseServer
            .storage
            .from('gjtong-outputs')
            .createSignedUrl(docxPath, 3600);
          docxUrl = signedData?.signedUrl ?? null;
        }

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'done', caseId, docxUrl })
        ));
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成失败';
        console.error('Complaint generate error:', err);

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
