-- Add ipfs_cid column to snippets table
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS ipfs_cid VARCHAR(255);

-- Create index for faster lookups by ipfs_cid
CREATE INDEX IF NOT EXISTS idx_snippets_ipfs_cid ON snippets(ipfs_cid);
