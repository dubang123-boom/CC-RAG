import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { validateActivationCode } from '@/lib/activation-code';

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
        .insert({
          status: 'uploaded',
          case_type: 'complaint',
          text_content: textContent.trim(),
          activation_code: activationCode.toUpperCase().trim(),
        })
        .select('id')
        .single();

      if (caseError || !caseData) {
        console.error('Failed to create complaint case:', caseError);
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

    // Create case with case_type='complaint'
    const { data: caseData, error: caseError } = await supabaseServer
      .from('gjt_cases')
      .insert({
        status: 'uploaded',
        case_type: 'complaint',
        activation_code: activationCode.toUpperCase().trim(),
      })
      .select('id')
      .single();

    if (caseError || !caseData) {
      console.error('Failed to create complaint case:', caseError);
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
        { error: 'Failed to create upload URL' },
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
    console.error('POST /api/complaint/cases error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
