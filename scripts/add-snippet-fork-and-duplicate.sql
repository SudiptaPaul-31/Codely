-- Migration: Add snippet forking and duplication columns to snippets table
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS forked_from_id UUID REFERENCES snippets(id) ON DELETE SET NULL;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS is_fork BOOLEAN DEFAULT false;

-- Create index for faster querying of derivations / forked snippets
CREATE INDEX IF NOT EXISTS idx_snippets_forked_from ON snippets(forked_from_id);
