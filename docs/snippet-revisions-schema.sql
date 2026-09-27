-- Snippet Revision Management (issue #190)
-- Immutable revision history; restore appends a new row rather than overwriting.

CREATE TABLE IF NOT EXISTS snippet_revisions (
  id SERIAL PRIMARY KEY,
  snippet_id VARCHAR(64) NOT NULL,
  version_number INT NOT NULL,
  content TEXT NOT NULL,
  editor_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW(),
  title TEXT,
  language VARCHAR(64),
  change_summary TEXT,
  UNIQUE(snippet_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_snippet_revisions_snippet_id
  ON snippet_revisions(snippet_id);

CREATE INDEX IF NOT EXISTS idx_snippet_revisions_created_at
  ON snippet_revisions(snippet_id, created_at DESC);
