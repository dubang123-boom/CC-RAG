-- Document versioning: version 列 + supplement_text 列 + 唯一索引
ALTER TABLE gjt_documents
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE gjt_documents
  ADD COLUMN IF NOT EXISTS supplement_text TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gjt_documents_case_version
  ON gjt_documents (case_id, version);
