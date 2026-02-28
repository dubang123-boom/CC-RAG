-- Module 4: Structured metadata extraction
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_documents_metadata
  ON documents USING GIN (metadata);

CREATE OR REPLACE FUNCTION match_chunks_filtered(
  query_embedding    vector(1536),
  match_user_id      UUID,
  match_count        INT     DEFAULT 5,
  match_threshold    FLOAT   DEFAULT 0.7,
  filter_language    TEXT    DEFAULT NULL,
  filter_document_type TEXT  DEFAULT NULL
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
  JOIN documents d ON d.id = c.document_id
  WHERE c.user_id = match_user_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= match_threshold
    AND (filter_language      IS NULL OR d.metadata->>'language'      = filter_language)
    AND (filter_document_type IS NULL OR d.metadata->>'document_type' = filter_document_type)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
