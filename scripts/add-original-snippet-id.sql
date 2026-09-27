-- Add original_snippet_id column to support snippet forking/duplication
-- This column references the original snippet that was forked or duplicated
ALTER TABLE snippets
ADD COLUMN IF NOT EXISTS original_snippet_id UUID REFERENCES snippets(id);

-- Index for efficient lookups of forked/duplicated snippets
CREATE INDEX IF NOT EXISTS idx_snippets_original_snippet_id
ON snippets(original_snippet_id)
WHERE original_snippet_id IS NOT NULL;
