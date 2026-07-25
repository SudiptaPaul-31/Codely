CREATE TABLE IF NOT EXISTS blockchain_event_cursors (
  stream_name VARCHAR(100) PRIMARY KEY,
  cursor TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blockchain_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  cursor TEXT,
  tx_hash VARCHAR(255),
  contract_id VARCHAR(255),
  source TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'retrying', 'failed', 'ignored')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_identity_verifications (
  wallet_address VARCHAR(56) PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'verified'
    CHECK (status IN ('verified', 'revoked')),
  last_verified_at TIMESTAMP,
  tx_hash VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blockchain_event_logs_status_updated
  ON blockchain_event_logs(status, updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_blockchain_event_logs_tx_hash
  ON blockchain_event_logs(tx_hash);

CREATE INDEX IF NOT EXISTS idx_blockchain_event_logs_processed_at
  ON blockchain_event_logs(processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_identity_verifications_verified_at
  ON wallet_identity_verifications(last_verified_at DESC);
