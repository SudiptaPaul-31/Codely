CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  owner_wallet_address VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS folder_snippets (
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (folder_id, snippet_id)
);

CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_wallet_address);
CREATE INDEX IF NOT EXISTS idx_folders_created_at ON folders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_folder_snippets_folder ON folder_snippets(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_snippets_snippet ON folder_snippets(snippet_id);
