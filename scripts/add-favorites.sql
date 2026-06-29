-- Create favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR NOT NULL,
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(wallet_address, snippet_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_favorites_wallet ON favorites(wallet_address);
CREATE INDEX IF NOT EXISTS idx_favorites_snippet ON favorites(snippet_id);
