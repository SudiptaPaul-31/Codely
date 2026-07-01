CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(56) NOT NULL,
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  favorited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, snippet_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_wallet ON favorites(wallet_address);
CREATE INDEX IF NOT EXISTS idx_favorites_snippet ON favorites(snippet_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_wallet_snippet ON favorites (wallet_address, snippet_id);
