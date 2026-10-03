CREATE TABLE IF NOT EXISTS blockchain_sync_log (
  id SERIAL PRIMARY KEY,
  snippet_id VARCHAR(64) NOT NULL,
  transaction_hash VARCHAR(64),
  discrepancy_type VARCHAR(50),
  resolution VARCHAR(50),
  synced_at TIMESTAMP DEFAULT NOW()
);
