-- Add license support to snippets table
ALTER TABLE snippets 
ADD COLUMN IF NOT EXISTS license_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS license_transaction_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS license_metadata JSONB;

-- Index on license_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_snippets_license_type ON snippets(license_type);
