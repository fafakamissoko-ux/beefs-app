-- ============================================================
-- BASE MIGRATION: Users table + extensions
-- Must run BEFORE all other migrations
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS TABLE
-- Extends Supabase auth.users with app-specific data
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Identity
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  phone TEXT,

  -- Gamification
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  total_beefs_completed INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,

  -- Premium
  is_premium BOOLEAN DEFAULT false,
  premium_until TIMESTAMPTZ,
  premium_settings JSONB DEFAULT '{"showPremiumBadge": true, "showPremiumFrame": true, "showPremiumAnimations": true}'::jsonb,

  -- Badges
  badges TEXT[] DEFAULT '{}',

  -- Verification
  is_verified BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,

  -- Stripe
  stripe_customer_id TEXT,

  -- Settings
  notification_settings JSONB DEFAULT '{}'::jsonb,
  privacy_settings JSONB DEFAULT '{}'::jsonb
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON users FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Function update_user_balance is defined in 05_monetization_gamification.sql
