-- Add visibility column to snippets (Issue #157)
-- Valid values: private (default), public, shared
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'private';

-- Index for visibility-based queries
CREATE INDEX IF NOT EXISTS idx_snippets_visibility ON snippets(visibility) WHERE is_deleted = false;
