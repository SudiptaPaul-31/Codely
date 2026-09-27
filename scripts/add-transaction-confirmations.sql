CREATE TABLE IF NOT EXISTS transaction_confirmations (
  id UUID PRIMARY KEY,
  stellar_tx_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
  lifecycle TEXT NOT NULL DEFAULT 'preparing' CHECK (lifecycle IN ('preparing', 'submitted', 'confirming', 'confirmed', 'failed')),
  wallet_address TEXT NOT NULL,
  memo TEXT,
  ledger BIGINT,
  metadata JSONB,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_polled_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast hash lookups (status endpoint)
CREATE INDEX IF NOT EXISTS idx_tx_confirmations_hash ON transaction_confirmations(stellar_tx_hash);

-- Index for listing by wallet address
CREATE INDEX IF NOT EXISTS idx_tx_confirmations_wallet ON transaction_confirmations(wallet_address, created_at DESC);

-- Index for finding pending/confirming transactions that need polling
CREATE INDEX IF NOT EXISTS idx_tx_confirmations_polling ON transaction_confirmations(lifecycle, last_polled_at)
  WHERE lifecycle IN ('submitted', 'confirming');