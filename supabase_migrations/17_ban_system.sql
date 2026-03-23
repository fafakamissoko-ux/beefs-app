-- ============================================================
-- Migration 17: Enhanced ban system
-- Temporary bans + prevent re-registration
-- ============================================================

-- Add ban expiry and banned email tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Table to track banned emails (prevents re-registration)
CREATE TABLE IF NOT EXISTS banned_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  reason TEXT,
  banned_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE banned_emails ENABLE ROW LEVEL SECURITY;

-- Only admins (via service role) can manage banned emails
-- Anon users can check if their email is banned (for signup)
CREATE POLICY "Anyone can check if email is banned"
  ON banned_emails FOR SELECT USING (true);
