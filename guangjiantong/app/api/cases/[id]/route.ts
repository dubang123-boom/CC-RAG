import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Fetch case
    const { data: caseData, error: caseError } = await supabaseServer
      .from('gjt_cases')
      .select('*')
      .eq('id', id)
      .single();

    if (caseError || !caseData) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    // Fetch analysis
    const { data: analysisData } = await supabaseServer
      .from('gjt_analysis')
      .select('*')
      .eq('case_id', id)
      .single();

    // Fetch latest version document
    const { data: documentsData } = await supabaseServer
      .from('gjt_documents')
      .select('*')
      .eq('case_id', id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      case: caseData,
      analysis: analysisData || null,
      document: documentsData || null,
    });
  } catch (err) {
    console.error('GET /api/cases/[id] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
