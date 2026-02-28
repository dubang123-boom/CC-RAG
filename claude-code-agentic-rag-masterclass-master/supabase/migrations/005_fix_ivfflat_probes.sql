-- Drop the approximate IVFFlat index.
-- For small datasets (demo), PostgreSQL uses a sequential scan with 100% recall.
-- IVFFlat with lists=100 but few vectors causes random misses (non-deterministic results).
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Restore match_chunks as SQL (threshold lowered to 0.1 for better cross-lingual recall)
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_user_id   UUID,
  match_count     INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.1
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

CREATE OR REPLACE FUNCTION match_chunks_filtered(
  query_embedding    vector(1536),
  match_user_id      UUID,
  match_count        INT DEFAULT 5,
  match_threshold    FLOAT DEFAULT 0.1,
  filter_language    TEXT DEFAULT NULL,
  filter_document_type TEXT DEFAULT NULL
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
    AND (filter_language IS NULL OR d.metadata->>'language' = filter_language)
    AND (filter_document_type IS NULL OR d.metadata->>'document_type' = filter_document_type)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
