CREATE TABLE user_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  llm_api_key        TEXT,
  llm_base_url       TEXT,
  llm_model          TEXT,
  llm_title_model    TEXT,
  llm_system_prompt  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own settings"
  ON user_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
