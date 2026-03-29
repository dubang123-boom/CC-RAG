import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { analyzeComplaint, withTimeout, ANALYSIS_TIMEOUT } from '@/lib/claude';
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
        controller.enqueue(encoder.encode(
          sseEvent({ type: 'status', status: 'analyzing', message: '正在识别投诉内容...' })
        ));

        // Update case status
        await supabaseServer
          .from('gjt_cases')
          .update({ status: 'analyzing' })
          .eq('id', caseId);

        // Check if case has text_content
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
          controller.enqueue(encoder.encode(
            sseEvent({ type: 'status', status: 'analyzing', message: '正在评估升级风险...' })
          ));
          result = await withTimeout(analyzeComplaint(caseData.text_content, undefined, onProgress), ANALYSIS_TIMEOUT, '投诉分析');
        } else {
          // File upload mode
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

          if (mimeType === 'application/pdf') {
            const { text: extractedText } = await pdfParse(buffer);
            await supabaseServer
              .from('gjt_cases')
              .update({ text_content: extractedText })
              .eq('id', caseId);

            controller.enqueue(encoder.encode(
              sseEvent({ type: 'status', status: 'analyzing', message: '正在评估升级风险...' })
            ));

            result = await withTimeout(analyzeComplaint(extractedText, undefined, onProgress), ANALYSIS_TIMEOUT, '投诉分析');
          } else {
            controller.enqueue(encoder.encode(
              sseEvent({ type: 'status', status: 'analyzing', message: '正在评估升级风险...' })
            ));
            result = await withTimeout(analyzeComplaint(buffer, mimeType, onProgress), ANALYSIS_TIMEOUT, '投诉分析');
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

        // Save analysis to DB (complaint-specific fields)
        const { error: insertError } = await supabaseServer
          .from('gjt_analysis')
          .insert({
            case_id: caseId,
            violation_type: result.violation_type,
            cited_articles: result.cited_articles,
            questions: result.questions,
            // Complaint-specific fields
            complaint_type: result.complaint_type,
            complaint_source: result.complaint_source,
            complaint_summary: result.complaint_summary,
            escalation_risk: result.escalation_risk,
            escalation_risk_reason: result.escalation_risk_reason,
            recommended_strategy: result.recommended_strategy,
            strategy_explanation: result.strategy_explanation,
            consumer_claims: result.consumer_claims,
            estimated_cost: result.estimated_cost,
            response_deadline_days: result.response_deadline_days,
          });

        if (insertError) {
          console.error('Failed to save complaint analysis:', insertError);
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
        console.error('Complaint analysis error:', err);

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
