-- 007_complaint_module.sql
-- 扩展现有表以支持 12315 投诉应对模块

-- 1. gjt_cases: 增加案件类型
ALTER TABLE gjt_cases
  ADD COLUMN IF NOT EXISTS case_type TEXT DEFAULT 'penalty'
    CHECK (case_type IN ('penalty', 'complaint'));

-- 2. gjt_analysis: 增加投诉专用字段
ALTER TABLE gjt_analysis
  ADD COLUMN IF NOT EXISTS complaint_type TEXT,
  ADD COLUMN IF NOT EXISTS complaint_source TEXT,
  ADD COLUMN IF NOT EXISTS complaint_summary TEXT,
  ADD COLUMN IF NOT EXISTS escalation_risk TEXT
    CHECK (escalation_risk IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS escalation_risk_reason TEXT,
  ADD COLUMN IF NOT EXISTS recommended_strategy TEXT
    CHECK (recommended_strategy IN ('cooperative', 'negotiate', 'defend')),
  ADD COLUMN IF NOT EXISTS strategy_explanation TEXT,
  ADD COLUMN IF NOT EXISTS consumer_claims JSONB,
  ADD COLUMN IF NOT EXISTS estimated_cost JSONB,
  ADD COLUMN IF NOT EXISTS response_deadline_days INTEGER;

-- 3. gjt_documents: 增加投诉回复专用字段
ALTER TABLE gjt_documents
  ADD COLUMN IF NOT EXISTS response_letter_md TEXT,
  ADD COLUMN IF NOT EXISTS negotiation_script_md TEXT,
  ADD COLUMN IF NOT EXISTS risk_warning_md TEXT;
