-- ============================================================
-- Migration 12: Withdrawal Requests
-- Allows creators to request cash-out of their earned points
-- ============================================================

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_points INTEGER NOT NULL CHECK (amount_points >= 2000), -- 20€ minimum
  amount_euros DECIMAL(10,2) NOT NULL CHECK (amount_euros >= 20.00),
  method TEXT NOT NULL CHECK (method IN ('iban', 'paypal', 'orange_money', 'wave', 'mtn')),
  -- IBAN fields
  iban TEXT,
  account_holder_name TEXT,
  -- PayPal fields
  paypal_email TEXT,
  -- Mobile Money fields
  mobile_number TEXT,
  mobile_operator TEXT,
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'rejected')),
  admin_note TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);

-- RLS
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own withdrawal requests
CREATE POLICY "Users can view own withdrawal requests"
  ON withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own withdrawal requests
CREATE POLICY "Users can create withdrawal requests"
  ON withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only service role (admin) can update withdrawal requests
-- (admin uses SUPABASE_SERVICE_ROLE_KEY via API route)
