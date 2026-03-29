import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { validateActivationCode } from '@/lib/activation-code';

export async function GET(req: NextRequest) {
  try {
    // Admin detection: reuse the same Bearer token pattern as /api/admin/codes
    const adminSecret = process.env.ADMIN_SECRET;
    const authHeader = req.headers.get('authorization');
    const isAdmin = adminSecret && authHeader === `Bearer ${adminSecret}`;

    const selectFields = `
      id,
      case_type,
      status,
      created_at,
      gjt_analysis (
        violation_type,
        complaint_type,
        complaint_summary,
        penalty_amount,
        defensibility,
        escalation_risk
      )
    `;

    let data: Record<string, unknown>[] | null;
    let error: { message: string } | null;

    if (isAdmin) {
      // Admin: return all cases without activation_code filter
      ({ data, error } = await supabaseServer
        .from('gjt_cases')
        .select(selectFields)
        .order('created_at', { ascending: false }));
    } else {
      const activationCode = req.nextUrl.searchParams.get('activationCode');
      if (!activationCode) {
        return NextResponse.json(
          { error: '缺少激活码参数' },
          { status: 400 }
        );
      }

      const normalized = activationCode.toUpperCase().trim();

      ({ data, error } = await supabaseServer
        .from('gjt_cases')
        .select(selectFields)
        .eq('activation_code', normalized)
        .order('created_at', { ascending: false }));
    }

    if (error) {
      console.error('Failed to fetch cases:', error);
      return NextResponse.json(
        { error: '查询案件失败' },
        { status: 500 }
      );
    }

    // Flatten the joined analysis into the case object
    const cases = (data || []).map((row: Record<string, unknown>) => {
      const analysis = Array.isArray(row.gjt_analysis)
        ? row.gjt_analysis[0]
        : row.gjt_analysis;
      return {
        id: row.id,
        case_type: row.case_type,
        status: row.status,
        created_at: row.created_at,
        violation_type: analysis?.violation_type ?? null,
        complaint_type: analysis?.complaint_type ?? null,
        complaint_summary: analysis?.complaint_summary ?? null,
        penalty_amount: analysis?.penalty_amount ?? null,
        defensibility: analysis?.defensibility ?? null,
        escalation_risk: analysis?.escalation_risk ?? null,
      };
    });

    return NextResponse.json({ cases });
  } catch (err) {
    console.error('GET /api/cases error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { filename, mimeType, textContent, activationCode } = await req.json();

    // 激活码校验
    if (!activationCode || typeof activationCode !== 'string') {
      return NextResponse.json(
        { error: '请输入激活码' },
        { status: 400 }
      );
    }

    const codeCheck = await validateActivationCode(supabaseServer, activationCode);
    if (!codeCheck.valid) {
      return NextResponse.json(
        { error: codeCheck.error || '激活码无效' },
        { status: 403 }
      );
    }

    // Text input mode
    if (textContent) {
      if (typeof textContent !== 'string' || textContent.trim().length < 50) {
        return NextResponse.json(
          { error: '文字内容不能少于 50 字' },
          { status: 400 }
        );
      }

      const { data: caseData, error: caseError } = await supabaseServer
        .from('gjt_cases')
        .insert({ status: 'uploaded', text_content: textContent.trim(), activation_code: activationCode.toUpperCase().trim() })
        .select('id')
        .single();

      if (caseError || !caseData) {
        console.error('Failed to create case:', caseError);
        return NextResponse.json(
          { error: `创建案件失败: ${caseError?.message || '未知错误'}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ caseId: caseData.id });
    }

    // File upload mode
    if (!filename || !mimeType) {
      return NextResponse.json(
        { error: 'filename and mimeType are required' },
        { status: 400 }
      );
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use PDF, JPEG, or PNG.' },
        { status: 400 }
      );
    }

    // Create case
    const { data: caseData, error: caseError } = await supabaseServer
      .from('gjt_cases')
      .insert({ status: 'uploaded', activation_code: activationCode.toUpperCase().trim() })
      .select('id')
      .single();

    if (caseError || !caseData) {
      console.error('Failed to create case:', caseError);
      return NextResponse.json(
        { error: `创建案件失败: ${caseError?.message || '未知错误'}` },
        { status: 500 }
      );
    }

    const caseId = caseData.id;
    const ext = filename.split('.').pop() || 'bin';
    const storagePath = `${caseId}/${Date.now()}.${ext}`;

    // Generate signed upload URL
    const { data: uploadData, error: uploadError } = await supabaseServer
      .storage
      .from('gjtong-uploads')
      .createSignedUploadUrl(storagePath);

    if (uploadError || !uploadData) {
      console.error('Failed to create upload URL:', uploadError);
      return NextResponse.json(
        { error: 'Failed to create upload URL. Ensure the gjtong-uploads bucket exists.' },
        { status: 500 }
      );
    }

    // Insert file record
    const { error: fileError } = await supabaseServer
      .from('gjt_files')
      .insert({
        case_id: caseId,
        storage_path: storagePath,
        mime_type: mimeType,
        original_filename: filename,
      });

    if (fileError) {
      console.error('Failed to insert file record:', fileError);
    }

    return NextResponse.json({
      caseId,
      uploadUrl: uploadData.signedUrl,
      uploadToken: uploadData.token,
      storagePath,
    });
  } catch (err) {
    console.error('POST /api/cases error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
