-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- Remove obsolete column from conversations (no longer needed with Chat Completions)
ALTER TABLE conversations DROP COLUMN IF EXISTS openai_response_id;

-- Create documents table
CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  file_type   TEXT NOT NULL,
  file_size   BIGINT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'processing', 'complete', 'error')),
  error_msg   TEXT,
  chunk_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE USING (auth.uid() = user_id);

-- Create chunks table
CREATE TABLE chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  chunk_index INT NOT NULL,
  token_count INT,
  embedding   vector(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chunks"
  ON chunks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chunks"
  ON chunks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chunks"
  ON chunks FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_documents_user_id  ON documents(user_id);
CREATE INDEX idx_documents_status   ON documents(status);
CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE INDEX idx_chunks_user_id     ON chunks(user_id);

-- IVFFlat index for approximate nearest neighbor vector search
CREATE INDEX idx_chunks_embedding ON chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Auto-update updated_at on documents (reuses function from migration 001)
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime on documents table
ALTER PUBLICATION supabase_realtime ADD TABLE documents;

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_user_id   UUID,
  match_count     INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id          UUID,
  document_id UUID,
  content     TEXT,
  chunk_index INT,
  similarity  FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  WHERE c.user_id = match_user_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
