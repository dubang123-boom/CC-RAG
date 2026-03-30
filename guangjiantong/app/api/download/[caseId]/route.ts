import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { generateDOCX } from '@/lib/docx';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;

  if (!caseId) {
    return Response.json({ error: 'caseId is required' }, { status: 400 });
  }

  const type = req.nextUrl.searchParams.get('type'); // "hearing" or null

  const { data: doc, error } = await supabaseServer
    .from('gjt_documents')
    .select('statement_md, response_letter_md, hearing_application_md, evidence_checklist_md, negotiation_script_md, risk_warning_md')
    .eq('case_id', caseId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !doc) {
    return Response.json({ error: '未找到该案件的文书记录' }, { status: 404 });
  }

  // Pick the right markdown source
  let markdown: string | null = null;
  let filename: string;

  if (type === 'hearing') {
    markdown = doc.hearing_application_md;
    filename = '听证申请书.docx';
  } else if (type === 'evidence') {
    markdown = doc.evidence_checklist_md
      ? '# **证据清单与附件准备指南**\n\n' + doc.evidence_checklist_md
      : null;
    filename = '证据清单.docx';
  } else if (type === 'negotiation') {
    markdown = doc.negotiation_script_md;
    filename = '协商话术.docx';
  } else if (type === 'risk') {
    markdown = doc.risk_warning_md;
    filename = '整改与风险.docx';
  } else {
    // statement_md for 申辩书, response_letter_md for 投诉回复函
    markdown = doc.statement_md ?? doc.response_letter_md;
    filename = doc.statement_md ? '陈述申辩意见书.docx' : '投诉回复函.docx';
  }

  if (!markdown) {
    return Response.json(
      { error: '未找到该案件的文书 Markdown，无法生成 Word 文档' },
      { status: 404 }
    );
  }

  try {
    const docxBuffer = await generateDOCX(markdown);

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[download] DOCX generation failed', {
      caseId,
      type,
      error: e instanceof Error ? e.message : e,
    });
    return Response.json(
      { error: 'Word 文档生成失败，请稍后重试' },
      { status: 500 }
    );
  }
}
