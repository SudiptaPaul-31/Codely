-- Marketplace listings table
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  seller_wallet VARCHAR(255) NOT NULL,
  price_xlm NUMERIC(18, 7) NOT NULL CHECK (price_xlm > 0),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  on_chain_listing_tx VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Marketplace purchases table
CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id),
  buyer_wallet VARCHAR(255) NOT NULL,
  seller_wallet VARCHAR(255) NOT NULL,
  price_xlm NUMERIC(18, 7) NOT NULL,
  escrow_tx_hash VARCHAR(255),
  release_tx_hash VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'escrowed', 'completed', 'refunded')),
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Escrow records table
CREATE TABLE IF NOT EXISTS marketplace_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES marketplace_purchases(id),
  escrow_account VARCHAR(255) NOT NULL,
  amount_xlm NUMERIC(18, 7) NOT NULL,
  lock_tx_hash VARCHAR(255),
  release_tx_hash VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'released', 'refunded')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP
);

-- Marketplace audit logs table
CREATE TABLE IF NOT EXISTS marketplace_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_wallet VARCHAR(255),
  details JSONB DEFAULT '{}'::jsonb,
  tx_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_listings_snippet_id ON marketplace_listings(snippet_id);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON marketplace_listings(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_listings_status ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_purchases_listing_id ON marketplace_purchases(listing_id);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON marketplace_purchases(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_escrow_purchase_id ON marketplace_escrow(purchase_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON marketplace_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON marketplace_audit_logs(actor_wallet);
CREATE INDEX IF NOT EXISTS idx_audit_created ON marketplace_audit_logs(created_at DESC);
