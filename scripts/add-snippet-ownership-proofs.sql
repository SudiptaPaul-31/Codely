CREATE TABLE IF NOT EXISTS snippet_ownership_proofs (
  snippet_id UUID PRIMARY KEY REFERENCES snippets(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  owner_wallet TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  anchored_transaction_hash TEXT,
  anchored_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_snippet_ownership_proofs_wallet
  ON snippet_ownership_proofs(owner_wallet);