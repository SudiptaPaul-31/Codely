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

-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_snippets_owner_created ON snippets(owner_wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snippets_deleted_owner ON snippets(owner_wallet_address, deleted_at DESC) WHERE is_deleted = true;
CREATE INDEX IF NOT EXISTS idx_verifications_snippet_active ON snippet_verifications(snippet_id, verified_at DESC) WHERE is_revoked = false;
CREATE INDEX IF NOT EXISTS idx_verifications_wallet_active ON snippet_verifications(wallet_address, verified_at DESC) WHERE is_revoked = false;
CREATE INDEX IF NOT EXISTS idx_verif_attempts_snippet_time ON verification_attempt_logs(snippet_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_permissions_snippet_grantee_active ON snippet_permissions(snippet_id, grantee_wallet_address) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_permissions_active_granted ON snippet_permissions(snippet_id, granted_at DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_perm_activity_snippet_created ON permission_activity_log(snippet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_status_created ON marketplace_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer_purchased ON marketplace_purchases(buyer_wallet, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_listing_buyer_status ON marketplace_purchases(listing_id, buyer_wallet, status);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type_created ON marketplace_audit_logs(entity_type, created_at DESC);
