-- Add owner column to snippets table if it doesn't exist
ALTER TABLE snippets 
ADD COLUMN IF NOT EXISTS owner VARCHAR(56);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(56) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create auth sessions table for JWT management
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(56) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  nonce VARCHAR(255),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
);

-- Create nonces table for replay protection
CREATE TABLE IF NOT EXISTS login_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce VARCHAR(255) UNIQUE NOT NULL,
  wallet_address VARCHAR(56),
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_wallet_address ON auth_sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_nonces_nonce ON login_nonces(nonce);
CREATE INDEX IF NOT EXISTS idx_snippets_owner ON snippets(owner);
