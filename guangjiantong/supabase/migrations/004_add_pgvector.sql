-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge chunks table for RAG
CREATE TABLE gjt_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file TEXT NOT NULL,
  source_category TEXT NOT NULL,     -- '法律' | '行政法规' | '规章' | 'root'
  article_number TEXT,               -- '第九条' or null
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_file, chunk_index)
);

-- HNSW index for cosine similarity search
CREATE INDEX gjt_knowledge_chunks_embedding_idx
  ON gjt_knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Row-level security
ALTER TABLE gjt_knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Semantic search RPC
CREATE FUNCTION match_knowledge_chunks(
  query_embedding vector(1024),
  match_threshold FLOAT DEFAULT 0.35,
  match_count INT DEFAULT 20
) RETURNS TABLE (
  id UUID,
  source_file TEXT,
  source_category TEXT,
  article_number TEXT,
  chunk_index INTEGER,
  content TEXT,
  similarity FLOAT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.source_file,
    c.source_category,
    c.article_number,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM gjt_knowledge_chunks c
  WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
