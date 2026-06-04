-- Snippet verifications table
-- Stores wallet ownership verification for snippets
CREATE TABLE IF NOT EXISTS snippet_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  wallet_address VARCHAR(56) NOT NULL,
  signature TEXT NOT NULL,
  message TEXT NOT NULL,
  verified_at TIMESTAMP,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'verified', 'failed', 'revoked')),
  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Verification audit logs table
-- Tracks all verification attempts and actions
CREATE TABLE IF NOT EXISTS verification_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  wallet_address VARCHAR(56) NOT NULL,
  attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action VARCHAR(20) NOT NULL CHECK (action IN ('verify_attempt', 'verify_success', 'verify_failed', 'revoke')),
  success BOOLEAN NOT NULL,
  error_message TEXT,
  ip_address VARCHAR(45)
);

-- Indexes for snippet_verifications
CREATE INDEX IF NOT EXISTS idx_snippet_verifications_snippet_id ON snippet_verifications(snippet_id);
CREATE INDEX IF NOT EXISTS idx_snippet_verifications_wallet_address ON snippet_verifications(wallet_address);
CREATE INDEX IF NOT EXISTS idx_snippet_verifications_status ON snippet_verifications(status);
CREATE INDEX IF NOT EXISTS idx_snippet_verifications_is_active ON snippet_verifications(is_active);

-- Indexes for verification_audit_logs
CREATE INDEX IF NOT EXISTS idx_verification_audit_logs_snippet_id ON verification_audit_logs(snippet_id);
CREATE INDEX IF NOT EXISTS idx_verification_audit_logs_wallet_address ON verification_audit_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_verification_audit_logs_action ON verification_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_verification_audit_logs_attempt_time ON verification_audit_logs(attempt_time DESC);
