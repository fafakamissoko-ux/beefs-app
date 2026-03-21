-- =====================================================
-- BEEFS - CHAT SYSTEM
-- Migration 11: Messages/Comments persistence
-- =====================================================

-- =====================================================
-- 1. BEEF MESSAGES (Chat/Comments)
-- =====================================================

CREATE TABLE IF NOT EXISTS beef_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES beefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_beef_messages_beef_id ON beef_messages(beef_id);
CREATE INDEX idx_beef_messages_user_id ON beef_messages(user_id);
CREATE INDEX idx_beef_messages_created_at ON beef_messages(created_at DESC);
CREATE INDEX idx_beef_messages_pinned ON beef_messages(is_pinned) WHERE is_pinned = true;

-- =====================================================
-- 2. REACTIONS HISTORY (Optional - for analytics)
-- =====================================================

CREATE TABLE IF NOT EXISTS beef_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES beefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(beef_id, user_id, emoji, created_at)
);

CREATE INDEX idx_beef_reactions_beef_id ON beef_reactions(beef_id);
CREATE INDEX idx_beef_reactions_user_id ON beef_reactions(user_id);
CREATE INDEX idx_beef_reactions_emoji ON beef_reactions(emoji);

-- =====================================================
-- 3. MODERATION (Ban words, Rate limiting)
-- =====================================================

CREATE TABLE IF NOT EXISTS banned_words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word TEXT NOT NULL UNIQUE,
  severity TEXT DEFAULT 'moderate', -- 'low', 'moderate', 'high'
  action TEXT DEFAULT 'filter', -- 'filter', 'block', 'ban'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_banned_words_word ON banned_words(word) WHERE is_active = true;

-- Seed some default banned words
INSERT INTO banned_words (word, severity, action) VALUES
  ('spam', 'moderate', 'filter'),
  ('bot', 'low', 'filter')
ON CONFLICT (word) DO NOTHING;

-- =====================================================
-- 4. USER TIMEOUTS (Moderation)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_timeouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES beefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  moderator_id UUID REFERENCES users(id),
  reason TEXT,
  duration_seconds INTEGER DEFAULT 60,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(beef_id, user_id, created_at)
);

CREATE INDEX idx_user_timeouts_beef_user ON user_timeouts(beef_id, user_id);
CREATE INDEX idx_user_timeouts_expires_at ON user_timeouts(expires_at);

-- =====================================================
-- 5. FUNCTIONS
-- =====================================================

-- Check if user is timed out
CREATE OR REPLACE FUNCTION is_user_timed_out(
  p_beef_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_timed_out BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM user_timeouts
    WHERE beef_id = p_beef_id
      AND user_id = p_user_id
      AND expires_at > NOW()
  ) INTO v_is_timed_out;
  
  RETURN v_is_timed_out;
END;
$$ LANGUAGE plpgsql;

-- Get active message count for rate limiting
CREATE OR REPLACE FUNCTION get_recent_message_count(
  p_user_id UUID,
  p_beef_id UUID,
  p_seconds INTEGER DEFAULT 10
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM beef_messages
  WHERE user_id = p_user_id
    AND beef_id = p_beef_id
    AND created_at > NOW() - (p_seconds || ' seconds')::INTERVAL;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Filter message content for banned words
CREATE OR REPLACE FUNCTION filter_message_content(
  p_content TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_filtered_content TEXT;
  v_word RECORD;
BEGIN
  v_filtered_content := p_content;
  
  -- Replace banned words with asterisks
  FOR v_word IN 
    SELECT word
    FROM banned_words
    WHERE is_active = true
      AND action = 'filter'
  LOOP
    v_filtered_content := REGEXP_REPLACE(
      v_filtered_content,
      v_word.word,
      REPEAT('*', LENGTH(v_word.word)),
      'gi'
    );
  END LOOP;
  
  RETURN v_filtered_content;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. TRIGGERS
-- =====================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_message_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_beef_messages_updated_at
  BEFORE UPDATE ON beef_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_message_updated_at();

-- =====================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE beef_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE beef_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_timeouts ENABLE ROW LEVEL SECURITY;

-- Messages policies
CREATE POLICY "Anyone can read messages"
  ON beef_messages FOR SELECT
  USING (NOT is_deleted);

CREATE POLICY "Users can send messages"
  ON beef_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT is_user_timed_out(beef_id, user_id)
    AND get_recent_message_count(user_id, beef_id, 10) < 5 -- Max 5 messages per 10 seconds
  );

CREATE POLICY "Users can update their own messages"
  ON beef_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
  ON beef_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Reactions policies
CREATE POLICY "Anyone can view reactions"
  ON beef_reactions FOR SELECT
  USING (true);

CREATE POLICY "Users can add reactions"
  ON beef_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Timeouts policies (only moderators/hosts)
CREATE POLICY "Anyone can view timeouts"
  ON user_timeouts FOR SELECT
  USING (true);

CREATE POLICY "Moderators can create timeouts"
  ON user_timeouts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM beefs
      WHERE id = beef_id AND mediator_id = auth.uid()
    )
  );

-- =====================================================
-- 8. COMMENTS
-- =====================================================

COMMENT ON TABLE beef_messages IS 'Chat messages during beefs';
COMMENT ON TABLE beef_reactions IS 'Reaction history for analytics';
COMMENT ON TABLE banned_words IS 'Moderation - banned words list';
COMMENT ON TABLE user_timeouts IS 'User timeout/mute management';

COMMENT ON FUNCTION is_user_timed_out IS 'Check if user is currently timed out';
COMMENT ON FUNCTION get_recent_message_count IS 'Get message count for rate limiting';
COMMENT ON FUNCTION filter_message_content IS 'Filter banned words from messages';
