-- Reputation Table
CREATE TABLE IF NOT EXISTS reputation (
  wallet_address VARCHAR(255) PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reputation Actions Table (Audit Trail)
CREATE TABLE IF NOT EXISTS reputation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(255) NOT NULL REFERENCES reputation(wallet_address) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  points INTEGER NOT NULL,
  transaction_hash VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_reputation_actions_wallet ON reputation_actions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_reputation_score ON reputation(score DESC);
