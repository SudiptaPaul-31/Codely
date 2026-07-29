CREATE TABLE IF NOT EXISTS snippet_analytics (
  id UUID PRIMARY KEY,
  snippet_id UUID NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255),
  action_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_snippet_analytics_snippet_id ON snippet_analytics(snippet_id);
CREATE INDEX IF NOT EXISTS idx_snippet_analytics_action_type ON snippet_analytics(action_type);
CREATE INDEX IF NOT EXISTS idx_snippet_analytics_snippet_action ON snippet_analytics(snippet_id, action_type);
