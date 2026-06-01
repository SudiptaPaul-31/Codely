-- Snippet permissions table
-- Stores wallet-address-based view/edit grants per snippet
CREATE TABLE IF NOT EXISTS snippet_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  grantee_wallet_address VARCHAR(56) NOT NULL,
  permission_type VARCHAR(10) NOT NULL CHECK (permission_type IN ('view', 'edit')),
  granted_by_wallet_address VARCHAR(56) NOT NULL,
  -- On-chain anchor: hash of (snippet_id + grantee + permission_type + granted_at)
  on_chain_tx_hash VARCHAR(64),
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE (snippet_id, grantee_wallet_address, permission_type)
);

-- Activity log for all permission changes (grant/revoke)
CREATE TABLE IF NOT EXISTS permission_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL,
  actor_wallet_address VARCHAR(56) NOT NULL,
  target_wallet_address VARCHAR(56) NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('grant', 'revoke')),
  permission_type VARCHAR(10) NOT NULL CHECK (permission_type IN ('view', 'edit')),
  on_chain_tx_hash VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_permissions_snippet_id ON snippet_permissions(snippet_id);
CREATE INDEX IF NOT EXISTS idx_permissions_grantee ON snippet_permissions(grantee_wallet_address);
CREATE INDEX IF NOT EXISTS idx_permissions_active ON snippet_permissions(snippet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_activity_log_snippet ON permission_activity_log(snippet_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON permission_activity_log(actor_wallet_address);
