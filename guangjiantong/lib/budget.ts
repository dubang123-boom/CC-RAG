import { supabaseServer } from './supabase';

const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || '30');

// Approximate cost per API call (Qwen qvq-max, ~4k tokens in + ~4k tokens out)
const ESTIMATED_COST_PER_CALL_USD = 0.005;

interface BudgetCheck {
  allowed: boolean;
  todayCalls: number;
  maxCalls: number;
}

/**
 * Check whether today's API usage is within budget.
 * Uses a simple call-count approach stored in gjt_cases status transitions.
 */
export async function checkBudget(): Promise<BudgetCheck> {
  const maxCalls = Math.floor(DAILY_BUDGET_USD / ESTIMATED_COST_PER_CALL_USD);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Count today's analysis + generation calls (cases that entered analyzing or generating status)
  const { count, error } = await supabaseServer
    .from('gjt_cases')
    .select('*', { count: 'exact', head: true })
    .gte('updated_at', `${today}T00:00:00.000Z`)
    .in('status', ['analyzing', 'generating', 'awaiting-answers', 'completed']);

  if (error) {
    console.error('Budget check error:', error);
    // Fail open — allow the call but log the error
    return { allowed: true, todayCalls: 0, maxCalls };
  }

  const todayCalls = count ?? 0;
  return {
    allowed: todayCalls < maxCalls,
    todayCalls,
    maxCalls,
  };
}
