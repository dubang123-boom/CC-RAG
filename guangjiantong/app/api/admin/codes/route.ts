import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { generateCodes } from '@/lib/activation-code';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized();

  try {
    const { count = 1, maxUses = 3, memo } = await req.json();

    if (typeof count !== 'number' || count < 1 || count > 100) {
      return NextResponse.json(
        { error: 'count must be between 1 and 100' },
        { status: 400 }
      );
    }

    const codes = generateCodes(count);
    const rows = codes.map((code) => ({
      code,
      max_uses: maxUses,
      memo: memo || null,
    }));

    const { data, error } = await supabaseServer
      .from('gjt_activation_codes')
      .insert(rows)
      .select('code, max_uses, memo, created_at');

    if (error) {
      console.error('Failed to insert activation codes:', error);
      return NextResponse.json(
        { error: 'Failed to create codes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ codes: data });
  } catch (err) {
    console.error('POST /api/admin/codes error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized();

  try {
    const { data, error } = await supabaseServer
      .from('gjt_activation_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch codes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ codes: data });
  } catch (err) {
    console.error('GET /api/admin/codes error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
