-- ==========================================
-- CREATE FOLLOWERS TABLE & BEEF STATS
-- ==========================================

-- Create followers table
CREATE TABLE IF NOT EXISTS followers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Prevent duplicate follows
  UNIQUE(follower_id, following_id),
  -- Prevent self-follow
  CHECK (follower_id != following_id)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_followers_follower ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers(following_id);

-- Enable RLS
ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public followers viewable" ON followers
  FOR SELECT USING (true);

CREATE POLICY "Users can follow others" ON followers
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow" ON followers
  FOR DELETE USING (auth.uid() = follower_id);

-- ==========================================
-- FUNCTION TO GET USER STATS
-- ==========================================

-- Function to count beefs hosted by user
CREATE OR REPLACE FUNCTION get_user_beefs_count(user_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM beefs
  WHERE mediator_id = user_id;
$$ LANGUAGE SQL STABLE;

-- Function to count followers
CREATE OR REPLACE FUNCTION get_followers_count(user_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM followers
  WHERE following_id = user_id;
$$ LANGUAGE SQL STABLE;

-- Function to count following
CREATE OR REPLACE FUNCTION get_following_count(user_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM followers
  WHERE follower_id = user_id;
$$ LANGUAGE SQL STABLE;

-- Check if user A follows user B
CREATE OR REPLACE FUNCTION is_following(follower UUID, following UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM followers
    WHERE follower_id = follower AND following_id = following
  );
$$ LANGUAGE SQL STABLE;
