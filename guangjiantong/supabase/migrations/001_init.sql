-- 广监通 AI 初始化表结构（public schema）

-- 案件表
CREATE TABLE IF NOT EXISTS gjt_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN (
      'uploaded', 'analyzing', 'awaiting-answers',
      'generating', 'completed', 'failed'
    )),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 文件表
CREATE TABLE IF NOT EXISTS gjt_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES gjt_cases(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  original_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 分析结果表（Flow 1 输出）
CREATE TABLE IF NOT EXISTS gjt_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES gjt_cases(id) ON DELETE CASCADE,
  violation_type TEXT,
  cited_articles TEXT[],
  penalty_amount NUMERIC(12,2),
  defense_deadline DATE,
  hearing_eligible BOOLEAN DEFAULT FALSE,
  procedure_issues TEXT[],
  defensibility TEXT CHECK (defensibility IN ('强', '中', '弱')),
  defensibility_reason TEXT,
  questions JSONB,
  answers JSONB,
  raw_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 生成文书表（Flow 2 输出）
CREATE TABLE IF NOT EXISTS gjt_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES gjt_cases(id) ON DELETE CASCADE,
  statement_md TEXT,
  statement_pdf_path TEXT,
  evidence_checklist_md TEXT,
  hearing_application_md TEXT,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION set_gjt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gjt_cases_updated_at
  BEFORE UPDATE ON gjt_cases
  FOR EACH ROW EXECUTE FUNCTION set_gjt_updated_at();
