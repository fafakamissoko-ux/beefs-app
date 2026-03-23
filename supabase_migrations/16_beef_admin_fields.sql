-- ============================================================
-- Migration 16: Admin fields for beefs management
-- ============================================================

-- 1. Add admin management columns
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS feed_position INTEGER DEFAULT 0;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_beefs_featured ON beefs(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_beefs_feed_position ON beefs(feed_position);

-- 3. Admin RLS policies (allow admins to update/delete any beef)
CREATE POLICY "Admins can update any beef" ON beefs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Admins can delete any beef" ON beefs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );
