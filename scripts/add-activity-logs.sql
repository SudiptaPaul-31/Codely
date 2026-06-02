-- ============================================================
-- Activity Logs Migration
-- Run this after add-auth-tables.sql
-- ============================================================

-- Create the activity_logs table (append-only — no UPDATE/DELETE in app layer)
CREATE TABLE IF NOT EXISTS activity_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_wallet  VARCHAR(56),                          -- wallet that triggered the action (NULL for system events)
  action        VARCHAR(50)  NOT NULL,                -- e.g. 'snippet.created', 'wallet.connected'
  resource_type VARCHAR(50)  NOT NULL,                -- 'snippet' | 'wallet'
  resource_id   TEXT,                                 -- snippet UUID or wallet address
  metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- snapshot of relevant state at time of action
  ip_address    VARCHAR(45),                          -- IPv4 or IPv6
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()   -- immutable — never set by app code
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor        ON activity_logs(actor_wallet);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action       ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created      ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource     ON activity_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource_type ON activity_logs(resource_type);

-- Enforce append-only behavior at database level.
CREATE OR REPLACE FUNCTION prevent_activity_logs_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs is append-only and cannot be modified';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_logs_no_update ON activity_logs;
CREATE TRIGGER trg_activity_logs_no_update
BEFORE UPDATE ON activity_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_activity_logs_mutation();

DROP TRIGGER IF EXISTS trg_activity_logs_no_delete ON activity_logs;
CREATE TRIGGER trg_activity_logs_no_delete
BEFORE DELETE ON activity_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_activity_logs_mutation();

-- ============================================================
-- TAMPER-RESISTANCE NOTE
-- The application layer only ever performs INSERT on this table
-- (enforced via appendActivityLog in lib/activity-logger.ts).
--
-- For production hardening, consider applying a PostgreSQL
-- row-level security policy or a DB role that only has INSERT
-- privileges on this table:
--
--   REVOKE UPDATE, DELETE ON activity_logs FROM <app_role>;
--
-- This prevents any accidental or malicious modification of
-- historical log records.
-- ============================================================
