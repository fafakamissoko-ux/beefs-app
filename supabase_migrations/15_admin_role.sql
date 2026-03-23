-- ============================================================
-- Migration 15: Admin role system
-- ============================================================

-- 1. Add role column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));

-- 2. Admin settings table for view mode preferences
CREATE TABLE IF NOT EXISTS admin_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  view_mode TEXT DEFAULT 'admin' CHECK (view_mode IN ('admin', 'user', 'mediator', 'challenger')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own settings" ON admin_settings
  FOR ALL USING (auth.uid() = user_id);
