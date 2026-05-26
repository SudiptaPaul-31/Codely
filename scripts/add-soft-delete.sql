-- Add soft delete columns to snippets table
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

-- Create activity_logs table for audit trail
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY,
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  user_wallet_address VARCHAR(255),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_snippets_is_deleted ON snippets(is_deleted);
CREATE INDEX IF NOT EXISTS idx_snippets_deleted_at ON snippets(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_snippets_active ON snippets(is_deleted, created_at DESC);

-- Create indexes for activity logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_snippet_id ON activity_logs(snippet_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_wallet_address);
