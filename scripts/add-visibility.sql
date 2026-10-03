-- ============================================================
-- Migration: Snippet Visibility (private / public / shared)
-- Adds:
--   1. snippets.visibility            'private' | 'public' | 'shared'
--   2. snippets.share_token           optional share-link token (shared mode)
--   3. snippet_share_users            per-user grants for 'shared' mode
--   4. indexes for visibility queries
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. visibility column on snippets (default: private)
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private';
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);

-- Constrain to known values
ALTER TABLE snippets DROP CONSTRAINT IF EXISTS chk_snippets_visibility;
ALTER TABLE snippets ADD CONSTRAINT chk_snippets_visibility
  CHECK (visibility IN ('private', 'public', 'shared'));

-- 2. Per-user grants for 'shared' visibility
CREATE TABLE IF NOT EXISTS snippet_share_users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id              UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  user_wallet_address     VARCHAR(56) NOT NULL,
  granted_by_wallet_address VARCHAR(56),
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (snippet_id, user_wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_snippet_share_users_wallet ON snippet_share_users(user_wallet_address);
CREATE INDEX IF NOT EXISTS idx_snippet_share_users_snippet ON snippet_share_users(snippet_id);

-- 3. Performance indexes for visibility queries
CREATE INDEX IF NOT EXISTS idx_snippets_visibility ON snippets(visibility) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_snippets_public ON snippets(visibility, created_at DESC) WHERE visibility = 'public' AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_snippets_share_token ON snippets(share_token) WHERE share_token IS NOT NULL;

-- 4. Share links (existing table) become usable for 'shared' visibility too.
--    Nothing to alter: snippet_shares already exists with token/expiry/revocation.
