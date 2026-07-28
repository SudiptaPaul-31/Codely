-- Add ipfs_cid column to snippets table
ALTER TABLE snippets ADD COLUMN IF NOT EXISTS ipfs_cid VARCHAR(255);
