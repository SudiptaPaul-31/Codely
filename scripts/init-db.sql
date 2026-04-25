-- Drop tables if they exist (for fresh setup)
DROP TABLE IF EXISTS snippets CASCADE;

-- Create snippets table
CREATE TABLE snippets (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  language VARCHAR(50) NOT NULL,
  code TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_snippets_language ON snippets(language);
CREATE INDEX IF NOT EXISTS idx_snippets_created_at ON snippets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snippets_tags ON snippets USING GIN(tags);
