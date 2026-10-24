-- Usage instructions: author-written documentation for a snippet (overview,
-- prerequisites, setup, notes, and separate input/output examples).
--
-- One JSONB value per snippet; NULL means "no usage instructions". The shape
-- is validated by lib/usage-instructions.ts before it is written. Sections are
-- stored as Markdown text, never HTML, and rendered by lib/safe-markdown.tsx.
--
-- Writing it does not touch snippets.updated_at: the editor's conflict
-- detection (If-Unmodified-Since) compares against that column, and saving
-- documentation from the edit form must not make the form's own next save
-- look like a concurrent edit. The value carries its own updatedAt instead.

ALTER TABLE snippets ADD COLUMN IF NOT EXISTS usage_instructions JSONB;
