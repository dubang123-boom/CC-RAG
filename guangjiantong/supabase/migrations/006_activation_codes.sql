-- 激活码表
CREATE TABLE gjt_activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 3,
  used_count INTEGER NOT NULL DEFAULT 0,
  memo TEXT,                    -- 备注（闲鱼订单号、买家昵称等）
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX idx_activation_codes_code ON gjt_activation_codes(code);
ALTER TABLE gjt_activation_codes ENABLE ROW LEVEL SECURITY;

-- 案件表增加激活码字段
ALTER TABLE gjt_cases ADD COLUMN activation_code TEXT;

-- 原子扣减函数
CREATE OR REPLACE FUNCTION increment_activation_code_usage(code_text TEXT)
RETURNS BOOLEAN AS $$
DECLARE affected INTEGER;
BEGIN
  UPDATE gjt_activation_codes
  SET used_count = used_count + 1, last_used_at = NOW()
  WHERE code = code_text AND is_active = TRUE AND used_count < max_uses;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
