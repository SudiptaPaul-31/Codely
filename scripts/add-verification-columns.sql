-- Migration: Add on-chain timestamp verification columns to snippets table
-- Run once against your NeonDB instance.

-- Add verification columns (idempotent)
ALTER TABLE snippets
  ADD COLUMN IF NOT EXISTS on_chain_hash    TEXT,
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
  ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ;

-- Index for quickly querying verified snippets
CREATE INDEX IF NOT EXISTS idx_snippets_on_chain_hash
  ON snippets (on_chain_hash)
  WHERE on_chain_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_snippets_verified_at
  ON snippets (verified_at DESC)
  WHERE verified_at IS NOT NULL;
