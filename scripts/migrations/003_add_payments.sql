-- Payment tracking for Stellar asset payments
-- Supports premium snippet purchases and feature unlocks

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Payment identification
    payment_id VARCHAR(64) UNIQUE NOT NULL,
    transaction_hash VARCHAR(64) UNIQUE,
    
    -- Payment details
    snippet_id UUID REFERENCES snippets(id) ON DELETE SET NULL,
    asset_code VARCHAR(12) NOT NULL,
    amount DECIMAL(20, 7) NOT NULL,
    sender_wallet VARCHAR(56) NOT NULL,
    receiver_wallet VARCHAR(56) NOT NULL,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'expired')),
    
    -- Idempotency
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    
    -- Metadata
    memo TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_snippet_id ON payments(snippet_id);
CREATE INDEX IF NOT EXISTS idx_payments_sender_wallet ON payments(sender_wallet);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payments_updated_at ON payments;
CREATE TRIGGER trigger_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payments_updated_at();

-- Trigger to prevent modifying confirmed payments
CREATE OR REPLACE FUNCTION prevent_confirmed_payment_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'successful' AND NEW.status = 'successful' THEN
        IF NEW.transaction_hash IS DISTINCT FROM OLD.transaction_hash
           OR NEW.amount IS DISTINCT FROM OLD.amount
           OR NEW.sender_wallet IS DISTINCT FROM OLD.sender_wallet THEN
            RAISE EXCEPTION 'Cannot modify a confirmed payment';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payments_protect_confirmed ON payments;
CREATE TRIGGER trigger_payments_protect_confirmed
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION prevent_confirmed_payment_update();

COMMENT ON TABLE payments IS 'Tracks Stellar asset payments for snippet purchases and premium feature unlocks';
