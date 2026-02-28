-- Module 3: Content hashing for deduplication
-- Adds SHA-256 hex column to documents table.
-- Existing rows default to NULL (unknown hash) and will not be deduplicated
-- against new uploads until they are re-uploaded.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Composite index: fast lookup of (user, hash) pair in upload endpoint
CREATE INDEX IF NOT EXISTS idx_documents_content_hash
  ON documents(user_id, content_hash);
