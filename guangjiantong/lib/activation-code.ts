import type { SupabaseClient } from '@supabase/supabase-js';

// 排除易混淆字符 0/O/1/I/L
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return `YBF-${code}`;
}

export function generateCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateCode());
  }
  return Array.from(codes);
}

export async function validateActivationCode(
  supabase: SupabaseClient,
  code: string
): Promise<{ valid: boolean; remainingUses?: number; error?: string }> {
  const { data, error } = await supabase
    .from('gjt_activation_codes')
    .select('max_uses, used_count, is_active')
    .eq('code', code.toUpperCase().trim())
    .single();

  if (error || !data) {
    return { valid: false, error: '激活码不存在' };
  }

  if (!data.is_active) {
    return { valid: false, error: '激活码已被禁用' };
  }

  const remaining = data.max_uses - data.used_count;
  if (remaining <= 0) {
    return { valid: false, error: '激活码已用完，请购买新的激活码' };
  }

  return { valid: true, remainingUses: remaining };
}

export async function consumeActivationCode(
  supabase: SupabaseClient,
  code: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('increment_activation_code_usage', {
    code_text: code.toUpperCase().trim(),
  });

  if (error) {
    console.error('consumeActivationCode RPC error:', error);
    return false;
  }

  return data === true;
}
