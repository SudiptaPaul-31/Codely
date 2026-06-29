# Database Optimization Guide

## Index Strategy

All indexes were chosen by tracing actual query patterns in the repository and service layers. Each index maps to one or more SQL queries running in production.

---

## Tables & Indexes

### `snippets`

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| `idx_snippets_language` | `language` | B-tree | `WHERE language = $1` |
| `idx_snippets_lower_language` | `LOWER(language)` | B-tree | `WHERE LOWER(language) = $1` |
| `idx_snippets_created_at` | `created_at DESC` | B-tree | `ORDER BY created_at DESC` |
| `idx_snippets_title_trgm` | `title` | GIN (trgm) | `WHERE title ILIKE '%pattern%'` |
| `idx_snippets_tags_gin` | `tags` | GIN (jsonb) | `WHERE tags @> '["tag"]'` |
| `idx_snippets_search_vector` | full-text vector | GIN | `WHERE ... @@ websearch_to_tsquery(...)` |
| `idx_snippets_is_deleted` | `is_deleted` | B-tree | `WHERE is_deleted = false` |
| `idx_snippets_deleted_at` | `deleted_at DESC` | B-tree | `ORDER BY deleted_at DESC` |
| `idx_snippets_active` | `(is_deleted, created_at DESC)` | B-tree | `WHERE is_deleted = false ORDER BY created_at DESC` |
| `idx_snippets_owner` | `owner` | B-tree | `WHERE owner = $1` |
| **`idx_snippets_owner_created`** | `(owner_wallet_address, created_at DESC)` | B-tree | `WHERE owner_wallet_address = $1 ORDER BY created_at DESC` |
| **`idx_snippets_deleted_owner`** | `(owner_wallet_address, deleted_at DESC)` WHERE `is_deleted = true` | Partial B-tree | `WHERE is_deleted = true AND owner_wallet_address = $1 ORDER BY deleted_at DESC` |

**Bolded** indexes were added in the performance optimization migration.

---

### `snippet_verifications`

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| `idx_snippet_verifications_snippet_id` | `snippet_id` | B-tree | `WHERE snippet_id = $1` |
| `idx_snippet_verifications_wallet_address` | `wallet_address` | B-tree | `WHERE wallet_address = $1` |
| `idx_snippet_verifications_status` | `status` | B-tree | `WHERE status = $1` |
| `idx_snippet_verifications_is_active` | `is_active` | B-tree | `WHERE is_active = true` |
| **`idx_verifications_snippet_active`** | `(snippet_id, verified_at DESC)` WHERE `is_revoked = false` | Partial B-tree | `WHERE snippet_id = $1 AND is_revoked = false ORDER BY verified_at DESC LIMIT 1` |
| **`idx_verifications_wallet_active`** | `(wallet_address, verified_at DESC)` WHERE `is_revoked = false` | Partial B-tree | `WHERE wallet_address = $1 AND is_revoked = false ORDER BY verified_at DESC` |

---

### `verification_attempt_logs`

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| **`idx_verif_attempts_snippet_time`** | `(snippet_id, attempted_at DESC)` | B-tree | `WHERE snippet_id = $1 ORDER BY attempted_at DESC` |

---

### `snippet_permissions`

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| `idx_permissions_snippet_id` | `snippet_id` | B-tree | `WHERE snippet_id = $1` |
| `idx_permissions_grantee` | `grantee_wallet_address` | B-tree | `WHERE grantee_wallet_address = $1` |
| `idx_permissions_active` | `(snippet_id, is_active)` | B-tree | `WHERE snippet_id = $1 AND is_active = true` |
| **`idx_permissions_snippet_grantee_active`** | `(snippet_id, grantee_wallet_address)` WHERE `is_active = true` | Partial B-tree | `WHERE snippet_id = $1 AND grantee_wallet_address = $2 AND is_active = true` |
| **`idx_permissions_active_granted`** | `(snippet_id, granted_at DESC)` WHERE `is_active = true` | Partial B-tree | `WHERE snippet_id = $1 AND is_active = true ORDER BY granted_at DESC` |

---

### `permission_activity_log`

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| `idx_activity_log_snippet` | `snippet_id` | B-tree | `WHERE snippet_id = $1` |
| `idx_activity_log_actor` | `actor_wallet_address` | B-tree | `WHERE actor_wallet_address = $1` |
| **`idx_perm_activity_snippet_created`** | `(snippet_id, created_at DESC)` | B-tree | `WHERE snippet_id = $1 ORDER BY created_at DESC` |

---

### `marketplace_listings`

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| `idx_listings_snippet_id` | `snippet_id` | B-tree | `WHERE snippet_id = $1` |
| `idx_listings_seller` | `seller_wallet` | B-tree | `WHERE seller_wallet = $1` |
| `idx_listings_status` | `status` | B-tree | `WHERE status = $1` |
| **`idx_listings_status_created`** | `(status, created_at DESC)` | B-tree | `WHERE status = $1 ORDER BY created_at DESC` |

---

### `marketplace_purchases`

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| `idx_purchases_listing_id` | `listing_id` | B-tree | `WHERE listing_id = $1` |
| `idx_purchases_buyer` | `buyer_wallet` | B-tree | `WHERE buyer_wallet = $1` |
| **`idx_purchases_buyer_purchased`** | `(buyer_wallet, purchased_at DESC)` | B-tree | `WHERE buyer_wallet = $1 ORDER BY purchased_at DESC` |
| **`idx_purchases_listing_buyer_status`** | `(listing_id, buyer_wallet, status)` | B-tree | `WHERE listing_id = $1 AND buyer_wallet = $2 AND status = 'completed' LIMIT 1` |

---

### `marketplace_audit_logs`

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| `idx_audit_entity` | `(entity_type, entity_id)` | B-tree | `WHERE entity_type = $1 AND entity_id = $2` |
| `idx_audit_actor` | `actor_wallet` | B-tree | `WHERE actor_wallet = $1` |
| `idx_audit_created` | `created_at DESC` | B-tree | `ORDER BY created_at DESC` |
| **`idx_audit_entity_type_created`** | `(entity_type, created_at DESC)` | B-tree | `WHERE entity_type = $1 ORDER BY created_at DESC` |

---

### `activity_logs`

Well-covered by `add-activity-logs.sql`. Existing indexes handle all query patterns.

### `snippet_versions`

Well-covered by `add-versioning.sql`. Existing `idx_snippet_versions_version_number` handles `WHERE snippet_id = $1 ORDER BY version_number DESC`.

### `transactions`

Covered by `idx_transactions_wallet_address (wallet_address, created_at DESC)`.

---

## How to Add a New Index

1. Identify the exact query pattern from the repository/service code.
2. Check if an existing index already covers it (see tables above).
3. Add the `CREATE INDEX` statement to:
   - `scripts/migrations/<next_number>_<description>.sql` (for applying to existing DB)
   - `scripts/init-db.sql` (so new deployments get it)
4. Document it in this file.
5. Run `npx tsx scripts/run-optimization-migration.ts` to apply.

### Guidelines

- **Partial indexes** (`WHERE ...`) are preferred when queries consistently filter on a boolean column (e.g., `is_deleted`, `is_active`, `is_revoked`). They are smaller and faster than full-table indexes.
- **Covering indexes** with `INCLUDE` can be used for index-only scans when only specific columns are selected.
- **Composite indexes** should match the exact WHERE + ORDER BY clause. Column order matters: put equality filters first, then range/order columns.
- Always use `IF NOT EXISTS` so migrations are idempotent.

## Performance Monitoring

Check index usage with:
```sql
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan;
```
