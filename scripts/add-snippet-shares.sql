-- Snippet shares table for public link sharing
-- Supports read-only access via unique share tokens
CREATE TABLE IF NOT EXISTS snippet_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  share_token VARCHAR(64) NOT NULL UNIQUE,
  is_read_only BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,
  created_by_wallet_address VARCHAR(56) NOT NULL,
  revoked_at TIMESTAMP,
  revoked_by_wallet_address VARCHAR(56),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_snippet_shares_token ON snippet_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_snippet_shares_snippet_id ON snippet_shares(snippet_id);
CREATE INDEX IF NOT EXISTS idx_snippet_shares_expires_at ON snippet_shares(expires_at);
CREATE INDEX IF NOT EXISTS idx_snippet_shares_active ON snippet_shares(snippet_id, revoked_at);