-- Drop tables if they exist (for fresh setup)
DROP TABLE IF EXISTS snippets CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create snippets table
CREATE TABLE snippets (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  language VARCHAR(50) NOT NULL,
  code TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  owner_wallet_address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_snippets_language ON snippets(language);
CREATE INDEX IF NOT EXISTS idx_snippets_lower_language ON snippets(LOWER(language));
CREATE INDEX IF NOT EXISTS idx_snippets_created_at ON snippets(created_at DESC);
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
