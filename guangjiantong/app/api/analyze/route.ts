import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { analyzePenaltyDocument, withTimeout, ANALYSIS_TIMEOUT } from '@/lib/claude';
import { checkBudget } from '@/lib/budget';
import pdfParse from 'pdf-parse';

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { caseId } = await req.json();

  if (!caseId) {
    return new Response(
      JSON.stringify({ error: 'caseId is required' }),
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial status
        controller.enqueue(encoder.encode(
          sseEvent({ type: 'status', status: 'analyzing', message: '正在分析处罚文书...' })
        ));

        // Update case status
        await supabaseServer
          .from('gjt_cases')
          .update({ status: 'analyzing' })
          .eq('id', caseId);

        // Check if case has text_content (text input mode)
        const { data: caseData, error: caseError } = await supabaseServer
          .from('gjt_cases')
          .select('text_content')
          .eq('id', caseId)
          .single();

        if (caseError || !caseData) {
          throw new Error('Case not found');
        }

        let result;

        // 心跳：防止 Nginx/浏览器因长时间无数据而断开 SSE 连接
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }, 15000);

        try {
        const onProgress = (message: string) => {
          controller.enqueue(encoder.encode(
            sseEvent({ type: 'status', status: 'analyzing', message })
          ));
        };

        if (caseData.text_content) {
          // Text input mode: use text_content directly
          controller.enqueue(encoder.encode(
            sseEvent({ type: 'status', status: 'analyzing', message: '正在调用 AI 分析...' })
          ));
          result = await withTimeout(analyzePenaltyDocument(caseData.text_content, undefined, onProgress), ANALYSIS_TIMEOUT, '文书分析');
        } else {
          // File upload mode: download and parse file
          const { data: fileData, error: fileError } = await supabaseServer
            .from('gjt_files')
            .select('storage_path, mime_type')
            .eq('case_id', caseId)
            .single();

          if (fileError || !fileData) {
            throw new Error('File not found for this case');
          }

          const { data: fileBlob, error: downloadError } = await supabaseServer
            .storage
            .from('gjtong-uploads')
            .download(fileData.storage_path);

          if (downloadError || !fileBlob) {
            throw new Error('Failed to download file from storage');
          }

          const buffer = Buffer.from(await fileBlob.arrayBuffer());
          const mimeType = fileData.mime_type as 'application/pdf' | 'image/jpeg' | 'image/png';

          // Extract text from PDF and save to gjt_cases for the generate stage
          if (mimeType === 'application/pdf') {
            const { text: extractedText } = await pdfParse(buffer);
            await supabaseServer
              .from('gjt_cases')
              .update({ text_content: extractedText })
              .eq('id', caseId);

            controller.enqueue(encoder.encode(
              sseEvent({ type: 'status', status: 'analyzing', message: '正在调用 AI 分析...' })
            ));

            // Pass extracted text directly (avoids double pdf-parse)
            result = await withTimeout(analyzePenaltyDocument(extractedText, undefined, onProgress), ANALYSIS_TIMEOUT, '文书分析');
          } else {
            controller.enqueue(encoder.encode(
              sseEvent({ type: 'status', status: 'analyzing', message: '正在调用 AI 分析...' })
            ));

            result = await withTimeout(analyzePenaltyDocument(buffer, mimeType, onProgress), ANALYSIS_TIMEOUT, '文书分析');
          }
        }
        } finally {
          clearInterval(heartbeat);
        }

        // Delete old analysis for re-analysis
        await supabaseServer
          .from('gjt_analysis')
          .delete()
          .eq('case_id', caseId);

        // Save analysis to DB
        const { error: insertError } = await supabaseServer
          .from('gjt_analysis')
          .insert({
            case_id: caseId,
            violation_type: result.violation_type,
            cited_articles: result.cited_articles,
            penalty_amount: result.penalty_amount,
            defense_deadline: result.defense_deadline,
            hearing_eligible: result.hearing_eligible,
            procedure_issues: result.procedure_issues,
            defensibility: result.defensibility,
            defensibility_reason: result.defensibility_reason,
            questions: result.questions,
          });

        if (insertError) {
          console.error('Failed to save analysis:', insertError);
          throw new Error('Failed to save analysis results');
        }

        // Update case status
        await supabaseServer
          .from('gjt_cases')
          .update({ status: 'awaiting-answers' })
          .eq('id', caseId);

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'result', status: 'awaiting-answers', analysis: result })
        ));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Analysis error:', err);

        try {
          await supabaseServer
            .from('gjt_cases')
            .update({ status: 'failed', error_message: message })
            .eq('id', caseId);
        } catch (dbErr) {
          console.error('Failed to update case status:', dbErr);
        }

        controller.enqueue(encoder.encode(
          sseEvent({ type: 'error', message })
        ));
      } finally {
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
