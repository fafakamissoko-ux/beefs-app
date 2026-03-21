-- Add Stripe customer ID column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe Customer ID for billing';
