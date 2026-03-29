import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { validateActivationCode } from '@/lib/activation-code';

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { valid: false, error: '请输入激活码' },
        { status: 400 }
      );
    }

    const result = await validateActivationCode(supabaseServer, code);
    return NextResponse.json(result);
  } catch (err) {
    console.error('POST /api/codes/validate error:', err);
    return NextResponse.json(
      { valid: false, error: '验证失败，请稍后重试' },
      { status: 500 }
    );
  }
}
