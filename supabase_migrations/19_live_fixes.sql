-- ============================================================
-- Migration 19: Live system fixes
-- Add tension_level to beefs, create reactions broadcast table
-- ============================================================

-- Add tension_level to beefs table
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS tension_level INTEGER DEFAULT 0;

-- Create increment_tension RPC function
CREATE OR REPLACE FUNCTION increment_tension(room_id UUID, increment_value INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE beefs 
  SET tension_level = LEAST(100, COALESCE(tension_level, 0) + increment_value) 
  WHERE id = room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Realtime reactions table (broadcast between users)
CREATE TABLE IF NOT EXISTS beef_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  beef_id UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-delete old reactions (keep last 5 min only)
CREATE INDEX IF NOT EXISTS idx_beef_reactions_beef ON beef_reactions(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_reactions_created ON beef_reactions(created_at);

ALTER TABLE beef_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reactions" ON beef_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can react" ON beef_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
