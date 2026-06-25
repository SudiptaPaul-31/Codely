-- ============================================================
-- Snippet Analytics Migration
-- Tracks snippet interactions (views, copies, shares)
-- ============================================================

-- Create the snippet_analytics table (append-only)
CREATE TABLE IF NOT EXISTS snippet_analytics (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id      UUID         NOT NULL,
  user_wallet     VARCHAR(56),                        -- wallet address of user who performed action (NULL for anonymous)
  action_type     VARCHAR(20)  NOT NULL,              -- 'view' | 'copy' | 'share'
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- action-specific metadata (e.g., share method, copy format)
  ip_address      VARCHAR(45),                        -- IPv4 or IPv6
  user_agent      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Foreign key constraint
ALTER TABLE snippet_analytics
ADD CONSTRAINT fk_snippet_analytics_snippet
FOREIGN KEY (snippet_id) REFERENCES snippets(id) ON DELETE CASCADE;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_snippet_analytics_snippet_id
  ON snippet_analytics(snippet_id);

CREATE INDEX IF NOT EXISTS idx_snippet_analytics_action_type
  ON snippet_analytics(action_type);

CREATE INDEX IF NOT EXISTS idx_snippet_analytics_snippet_action
  ON snippet_analytics(snippet_id, action_type);

CREATE INDEX IF NOT EXISTS idx_snippet_analytics_created
  ON snippet_analytics(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snippet_analytics_user
  ON snippet_analytics(user_wallet);

CREATE INDEX IF NOT EXISTS idx_snippet_analytics_snippet_created
  ON snippet_analytics(snippet_id, created_at DESC);

-- Enforce append-only behavior
CREATE OR REPLACE FUNCTION prevent_snippet_analytics_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'snippet_analytics is append-only and cannot be modified';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_snippet_analytics_no_update ON snippet_analytics;
CREATE TRIGGER trg_snippet_analytics_no_update
BEFORE UPDATE ON snippet_analytics
FOR EACH ROW
EXECUTE FUNCTION prevent_snippet_analytics_mutation();

DROP TRIGGER IF EXISTS trg_snippet_analytics_no_delete ON snippet_analytics;
CREATE TRIGGER trg_snippet_analytics_no_delete
BEFORE DELETE ON snippet_analytics
FOR EACH ROW
EXECUTE FUNCTION prevent_snippet_analytics_mutation();

-- ============================================================
-- USAGE NOTES
-- 
-- The analytics table is append-only. Insert records via:
--   INSERT INTO snippet_analytics 
--   (snippet_id, user_wallet, action_type, metadata, ip_address, user_agent) 
--   VALUES ($1, $2, $3, $4, $5, $6)
--
-- Query patterns (see analytics.service.ts):
--   - Get analytics for a specific snippet with time-range filtering
--   - Get aggregated counts by action type
--   - Get top snippets by action count
--   - Get user activity timeline
-- ============================================================
