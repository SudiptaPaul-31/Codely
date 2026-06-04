CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet_address ON transactions(wallet_address, created_at DESC);