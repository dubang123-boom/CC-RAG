-- 启用 RLS，仅 service_role key 可访问（自动绕过 RLS）
-- anon key 用户无匹配策略 = 拒绝所有操作

ALTER TABLE gjt_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE gjt_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE gjt_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE gjt_documents ENABLE ROW LEVEL SECURITY;
