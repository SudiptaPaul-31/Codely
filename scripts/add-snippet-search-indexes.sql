CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_snippets_lower_language ON snippets(LOWER(language));
CREATE INDEX IF NOT EXISTS idx_snippets_title_trgm ON snippets USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_snippets_tags_gin ON snippets USING GIN (tags jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_snippets_search_vector ON snippets USING GIN (
  (
    setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(description, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(code, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(language, '')), 'B') ||
    setweight(jsonb_to_tsvector('simple', COALESCE(tags, '[]'::jsonb), '["string"]'), 'B')
  )
);
