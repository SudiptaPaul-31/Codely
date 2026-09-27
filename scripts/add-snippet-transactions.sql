-- Snippet ↔ Stellar transaction associations.
-- Every transaction that carries a snippet memo reference gets one row per
-- referenced snippet, so a snippet's history can be reconstructed from chain data.

CREATE TABLE IF NOT EXISTS snippet_transactions (
  id UUID PRIMARY KEY,
  snippet_id VARCHAR(64) NOT NULL,
  transaction_hash VARCHAR(64) NOT NULL,
  memo_ref VARCHAR(64) NOT NULL,
  ledger_sequence BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'failed')),
  tx_type VARCHAR(50),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A transaction can only be linked to the same snippet once.
  CONSTRAINT snippet_transactions_snippet_tx_unique UNIQUE (snippet_id, transaction_hash)
);

-- Snippet traceability: list every transaction that references a snippet.
CREATE INDEX IF NOT EXISTS idx_snippet_transactions_snippet
  ON snippet_transactions(snippet_id, created_at DESC);

-- Reverse lookup: resolve the snippet(s) a confirmed transaction memo points at.
CREATE INDEX IF NOT EXISTS idx_snippet_transactions_memo_ref
  ON snippet_transactions(memo_ref);

-- Confirmation tracking / reconciliation.
CREATE INDEX IF NOT EXISTS idx_snippet_transactions_status
  ON snippet_transactions(status);

CREATE INDEX IF NOT EXISTS idx_snippet_transactions_hash
  ON snippet_transactions(transaction_hash);
