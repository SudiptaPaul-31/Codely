-- ============================================================
-- Migration 001: Add Performance Indexes
-- 
-- Adds missing indexes identified by query pattern analysis
-- across all tables. Each index maps to specific repository
-- queries documented in docs/database-optimization.md.
-- ============================================================

-- ── snippets ───────────────────────────────────────────────────────────────────
-- Query: findDeletedByUser() — "is_deleted = true AND owner_wallet_address = $1 ORDER BY deleted_at DESC"
CREATE INDEX IF NOT EXISTS idx_snippets_deleted_owner
  ON snippets(owner_wallet_address, deleted_at DESC)
  WHERE is_deleted = true;

-- Query: common pattern "WHERE owner_wallet_address = $1 ORDER BY created_at DESC"
CREATE INDEX IF NOT EXISTS idx_snippets_owner_created
  ON snippets(owner_wallet_address, created_at DESC);

-- ── snippet_verifications ──────────────────────────────────────────────────────
-- Query: getVerificationStatus() — "WHERE snippet_id = $1 AND is_revoked = false ORDER BY verified_at DESC LIMIT 1"
CREATE INDEX IF NOT EXISTS idx_verifications_snippet_active
  ON snippet_verifications(snippet_id, verified_at DESC)
  WHERE is_revoked = false;

-- Query: getVerificationsByWallet() — "WHERE wallet_address = $1 AND is_revoked = false ORDER BY verified_at DESC"
CREATE INDEX IF NOT EXISTS idx_verifications_wallet_active
  ON snippet_verifications(wallet_address, verified_at DESC)
  WHERE is_revoked = false;

-- ── verification_attempt_logs ──────────────────────────────────────────────────
-- Query: getVerificationAuditLog() — "WHERE snippet_id = $1 ORDER BY attempted_at DESC"
CREATE INDEX IF NOT EXISTS idx_verif_attempts_snippet_time
  ON verification_attempt_logs(snippet_id, attempted_at DESC);

-- ── snippet_permissions ────────────────────────────────────────────────────────
-- Query: getPermissionForWallet() & hasPermission() — "WHERE snippet_id = $1 AND grantee_wallet_address = $2 AND is_active = true"
CREATE INDEX IF NOT EXISTS idx_permissions_snippet_grantee_active
  ON snippet_permissions(snippet_id, grantee_wallet_address)
  WHERE is_active = true;

-- Query: getPermissionsForSnippet() — "WHERE snippet_id = $1 AND is_active = true ORDER BY granted_at DESC"
CREATE INDEX IF NOT EXISTS idx_permissions_active_granted
  ON snippet_permissions(snippet_id, granted_at DESC)
  WHERE is_active = true;

-- ── permission_activity_log ────────────────────────────────────────────────────
-- Query: getActivityLog() — "WHERE snippet_id = $1 ORDER BY created_at DESC"
CREATE INDEX IF NOT EXISTS idx_perm_activity_snippet_created
  ON permission_activity_log(snippet_id, created_at DESC);

-- ── marketplace_listings ───────────────────────────────────────────────────────
-- Query: getListings() — "WHERE status = $1 ORDER BY created_at DESC"
CREATE INDEX IF NOT EXISTS idx_listings_status_created
  ON marketplace_listings(status, created_at DESC);

-- ── marketplace_purchases ──────────────────────────────────────────────────────
-- Query: getPurchasesByBuyer() — "WHERE buyer_wallet = $1 ORDER BY purchased_at DESC"
CREATE INDEX IF NOT EXISTS idx_purchases_buyer_purchased
  ON marketplace_purchases(buyer_wallet, purchased_at DESC);

-- Query: getPurchaseByListingAndBuyer() — "WHERE listing_id = $1 AND buyer_wallet = $2 AND status = 'completed'"
CREATE INDEX IF NOT EXISTS idx_purchases_listing_buyer_status
  ON marketplace_purchases(listing_id, buyer_wallet, status);

-- ── marketplace_audit_logs ─────────────────────────────────────────────────────
-- Query: getAuditLogs(entityType only) — "WHERE entity_type = $1 ORDER BY created_at DESC"
CREATE INDEX IF NOT EXISTS idx_audit_entity_type_created
  ON marketplace_audit_logs(entity_type, created_at DESC);
