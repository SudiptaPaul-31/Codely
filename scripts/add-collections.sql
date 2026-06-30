-- Collections: blockchain-backed snippet organisers linked to Stellar wallets

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  owner_wallet_address VARCHAR(255) NOT NULL,
  on_chain_tx_hash VARCHAR(255),
  on_chain_ledger INTEGER,
  on_chain_anchor TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collection_snippets (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, snippet_id)
);

CREATE INDEX IF NOT EXISTS idx_collections_owner ON collections(owner_wallet_address);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_public ON collections(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_collection_snippets_collection ON collection_snippets(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_snippets_snippet ON collection_snippets(snippet_id);
