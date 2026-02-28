-- memories 表：跨對話長期記憶
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'fact'
    CHECK (category IN ('fact', 'preference', 'instruction')),
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX idx_memories_user_id ON memories(user_id);

-- RLS
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memories"
  ON memories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories"
  ON memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories"
  ON memories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories"
  ON memories FOR DELETE
  USING (auth.uid() = user_id);

-- conversations 加 summary 欄位
ALTER TABLE conversations ADD COLUMN summary TEXT;
