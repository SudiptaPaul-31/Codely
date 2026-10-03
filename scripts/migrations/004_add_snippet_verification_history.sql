-- Snippet verification history: append-only log of blockchain verification
-- events per snippet (transaction hash, ledger sequence, confirmation status).
--
-- One row per transaction hash: reprocessing a transaction (cron recovery,
-- retries) converges the existing row instead of creating duplicates.

CREATE TABLE IF NOT EXISTS snippet_verification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Snippet reference (snippets.id is UUID)
    snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,

    -- On-chain identification
    transaction_hash VARCHAR(64) NOT NULL UNIQUE,
    ledger_sequence BIGINT,

    -- Event status: pending -> confirmed | failed
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'failed')),
    tx_type VARCHAR(50),
    error_message TEXT,

    -- On-chain confirmation timestamp (null until confirmed)
    verified_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Chronological history lookups for the GET /api/snippets/[id]/verification-history endpoint
CREATE INDEX IF NOT EXISTS idx_verification_history_snippet
    ON snippet_verification_history(snippet_id, created_at ASC);

-- Note: updated_at is maintained by the application layer (the repository's
-- upsert sets updated_at = NOW() on conflict). No trigger here: the migration
-- runner executes statements individually and cannot install plpgsql bodies.

COMMENT ON TABLE snippet_verification_history IS 'Append-only history of blockchain verification events per snippet (transaction hash, ledger sequence, confirmation status)';
