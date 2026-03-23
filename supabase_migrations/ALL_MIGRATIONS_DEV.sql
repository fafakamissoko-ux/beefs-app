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
-- ==========================================
-- SPRINT 4: BEEF CREATION TABLES
-- ==========================================

-- 1. BEEFS TABLE
-- Stores all beefs created by mediators
CREATE TABLE IF NOT EXISTS beefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Basic Info
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL, -- What's the beef about
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Mediator (creator)
  mediator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Context
  origin TEXT, -- How did it start
  conflict_date DATE, -- When did it happen
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'live', 'ended', 'cancelled')),
  -- pending: waiting for participants to accept
  -- ready: all accepted, waiting to start
  -- live: currently streaming
  -- ended: finished
  -- cancelled: beef was cancelled
  
  -- Premium
  is_premium BOOLEAN DEFAULT false,
  price DECIMAL(10, 2) DEFAULT 0,
  
  -- Session Info (when live)
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  
  -- Stats
  viewer_count INTEGER DEFAULT 0,
  max_viewers INTEGER DEFAULT 0,
  total_gifts_received INTEGER DEFAULT 0
);

-- 2. BEEF PARTICIPANTS TABLE
-- Tracks who is invited/participating in each beef
CREATE TABLE IF NOT EXISTS beef_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  beef_id UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Role
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'witness')),
  -- participant: main person in the beef
  -- witness: additional person who can speak
  
  is_main BOOLEAN DEFAULT true, -- Is this one of the 2 main people in beef?
  
  -- Invitation Status
  invite_status TEXT NOT NULL DEFAULT 'pending' CHECK (invite_status IN ('pending', 'accepted', 'declined')),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Session Status (when live)
  is_present BOOLEAN DEFAULT false, -- Currently in the session
  is_muted BOOLEAN DEFAULT false,
  is_speaking BOOLEAN DEFAULT false,
  speaking_time_seconds INTEGER DEFAULT 0,
  
  UNIQUE(beef_id, user_id)
);

-- 3. BEEF INVITATIONS TABLE
-- Stores invitation history and notifications
CREATE TABLE IF NOT EXISTS beef_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  beef_id UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Who sent the invite (mediator)
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Who receives the invite
  
  -- Message
  personal_message TEXT, -- Optional message from mediator
  
  -- Status
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'seen', 'accepted', 'declined', 'expired')),
  seen_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  
  UNIQUE(beef_id, invitee_id)
);

-- 4. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_beefs_mediator ON beefs(mediator_id);
CREATE INDEX IF NOT EXISTS idx_beefs_status ON beefs(status);
CREATE INDEX IF NOT EXISTS idx_beef_participants_beef ON beef_participants(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_participants_user ON beef_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_beef_participants_status ON beef_participants(invite_status);
CREATE INDEX IF NOT EXISTS idx_beef_invitations_beef ON beef_invitations(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_invitations_invitee ON beef_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_beef_invitations_status ON beef_invitations(status);

-- 5. ROW LEVEL SECURITY (RLS)

-- Enable RLS
ALTER TABLE beefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beef_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE beef_invitations ENABLE ROW LEVEL SECURITY;

-- BEEFS POLICIES

-- Anyone can view beefs
CREATE POLICY "Public beefs are viewable by everyone" ON beefs
  FOR SELECT USING (true);

-- Only authenticated users can create beefs (as mediator)
CREATE POLICY "Authenticated users can create beefs" ON beefs
  FOR INSERT WITH CHECK (auth.uid() = mediator_id);

-- Mediator can update their own beefs
CREATE POLICY "Mediators can update their beefs" ON beefs
  FOR UPDATE USING (auth.uid() = mediator_id);

-- Mediator can delete their own beefs
CREATE POLICY "Mediators can delete their beefs" ON beefs
  FOR DELETE USING (auth.uid() = mediator_id);

-- BEEF PARTICIPANTS POLICIES

-- Anyone can view participants
CREATE POLICY "Public participants viewable" ON beef_participants
  FOR SELECT USING (true);

-- Mediator can add participants
CREATE POLICY "Mediators can add participants" ON beef_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beefs 
      WHERE beefs.id = beef_id 
      AND beefs.mediator_id = auth.uid()
    )
  );

-- Participants can update their own status (accept/decline)
CREATE POLICY "Participants can update their status" ON beef_participants
  FOR UPDATE USING (auth.uid() = user_id);

-- Mediator can update participants in their beefs
CREATE POLICY "Mediators can update participants" ON beef_participants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beefs 
      WHERE beefs.id = beef_id 
      AND beefs.mediator_id = auth.uid()
    )
  );

-- BEEF INVITATIONS POLICIES

-- Users can view their own invitations
CREATE POLICY "Users can view their invitations" ON beef_invitations
  FOR SELECT USING (auth.uid() = invitee_id);

-- Mediators can view invitations they sent
CREATE POLICY "Mediators can view sent invitations" ON beef_invitations
  FOR SELECT USING (auth.uid() = inviter_id);

-- Mediators can create invitations for their beefs
CREATE POLICY "Mediators can send invitations" ON beef_invitations
  FOR INSERT WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (
      SELECT 1 FROM beefs 
      WHERE beefs.id = beef_id 
      AND beefs.mediator_id = auth.uid()
    )
  );

-- Invitees can update their invitation status
CREATE POLICY "Invitees can respond to invitations" ON beef_invitations
  FOR UPDATE USING (auth.uid() = invitee_id);

-- 6. FUNCTIONS

-- Function to check if beef is ready (all main participants accepted)
CREATE OR REPLACE FUNCTION check_beef_ready(beef_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  total_main INTEGER;
  accepted_main INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_main
  FROM beef_participants
  WHERE beef_id = beef_id_param AND is_main = true;
  
  SELECT COUNT(*) INTO accepted_main
  FROM beef_participants
  WHERE beef_id = beef_id_param AND is_main = true AND invite_status = 'accepted';
  
  RETURN (total_main > 0 AND total_main = accepted_main);
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update beef status when participants accept
CREATE OR REPLACE FUNCTION update_beef_status_on_acceptance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_status = 'accepted' AND OLD.invite_status != 'accepted' THEN
    -- Check if all main participants have accepted
    IF check_beef_ready(NEW.beef_id) THEN
      UPDATE beefs SET status = 'ready' WHERE id = NEW.beef_id AND status = 'pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update beef status
CREATE TRIGGER trigger_update_beef_status
AFTER UPDATE ON beef_participants
FOR EACH ROW
EXECUTE FUNCTION update_beef_status_on_acceptance();

-- Function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for beefs updated_at
CREATE TRIGGER update_beefs_updated_at
BEFORE UPDATE ON beefs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 7. SAMPLE DATA (for testing)
-- Uncomment to add test data

/*
-- Insert a test mediator beef
INSERT INTO beefs (title, subject, description, severity, mediator_id, status)
VALUES (
  'Conflit: Idée de startup volée',
  'Idée de startup',
  'Jean accuse Marc d\'avoir volé son concept de startup après leur collaboration.',
  'high',
  (SELECT id FROM users WHERE username = 'mediator1' LIMIT 1),
  'pending'
);

-- Add participants
INSERT INTO beef_participants (beef_id, user_id, is_main, invite_status)
VALUES
  (
    (SELECT id FROM beefs WHERE title = 'Conflit: Idée de startup volée' LIMIT 1),
    (SELECT id FROM users WHERE username = 'jean' LIMIT 1),
    true,
    'pending'
  ),
  (
    (SELECT id FROM beefs WHERE title = 'Conflit: Idée de startup volée' LIMIT 1),
    (SELECT id FROM users WHERE username = 'marc' LIMIT 1),
    true,
    'pending'
  );
*/
-- =====================================================
-- SQUAREUP - MONETIZATION & GAMIFICATION SYSTEM
-- Migration 05: Points, Gifts, Achievements, XP
-- =====================================================

-- =====================================================
-- 1. TRANSACTIONS (Points History)
-- =====================================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'purchase', 'gift_sent', 'gift_received', 'beef_access', 'reward', 'subscription'
  amount INTEGER NOT NULL, -- points (negative for spending, positive for earning)
  balance_after INTEGER NOT NULL, -- snapshot of balance after transaction
  description TEXT,
  metadata JSONB DEFAULT '{}', -- {beef_id, gift_id, recipient_id, stripe_payment_id, etc.}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- =====================================================
-- 2. GIFT TYPES (Catalog)
-- =====================================================

CREATE TABLE IF NOT EXISTS gift_types (
  id TEXT PRIMARY KEY, -- 'rose', 'fire', 'diamond', 'crown'
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  price INTEGER NOT NULL, -- price in points
  animation_url TEXT, -- URL to Lottie/GIF animation (optional)
  tier INTEGER DEFAULT 1, -- 1=basic, 2=premium, 3=legendary
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial gift types
INSERT INTO gift_types (id, name, emoji, price, tier) VALUES
  ('rose', 'Rose', '🌹', 10, 1),
  ('fire', 'Fire', '🔥', 25, 1),
  ('diamond', 'Diamond', '💎', 50, 2),
  ('crown', 'Crown', '👑', 100, 2)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 3. GIFTS (Sent Gifts)
-- =====================================================

CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES beefs(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL, -- mediator or participant
  gift_type_id TEXT REFERENCES gift_types(id),
  points_amount INTEGER NOT NULL, -- actual points spent (can vary from catalog price)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gifts_beef_id ON gifts(beef_id);
CREATE INDEX idx_gifts_sender_id ON gifts(sender_id);
CREATE INDEX idx_gifts_recipient_id ON gifts(recipient_id);
CREATE INDEX idx_gifts_created_at ON gifts(created_at DESC);

-- =====================================================
-- 4. ACHIEVEMENT TYPES (Catalog)
-- =====================================================

CREATE TABLE IF NOT EXISTS achievement_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL,
  category TEXT NOT NULL, -- 'mediation', 'community', 'creation', 'premium'
  tier INTEGER DEFAULT 1, -- 1=bronze, 2=silver, 3=gold
  xp_reward INTEGER DEFAULT 0, -- XP earned when unlocked
  points_reward INTEGER DEFAULT 0, -- Bonus points earned when unlocked
  requirement JSONB NOT NULL, -- {type: 'count', target: 10, metric: 'beefs_mediated'}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial achievements
INSERT INTO achievement_types (id, name, description, emoji, category, tier, xp_reward, points_reward, requirement) VALUES
  -- MEDIATION
  ('peacemaker', 'Pacificateur', 'A médié 10 beefs avec résolution', '🕊️', 'mediation', 2, 200, 50, '{"type": "count", "target": 10, "metric": "beefs_mediated_resolved"}'),
  ('fair_judge', 'Juge Équitable', 'Moyenne de 4.5⭐ en médiation', '⚖️', 'mediation', 3, 300, 100, '{"type": "rating", "target": 4.5, "metric": "mediator_rating"}'),
  ('reconciler', 'Réconciliateur', '5 beefs terminés par accord mutuel', '🤝', 'mediation', 2, 250, 75, '{"type": "count", "target": 5, "metric": "beefs_mutual_agreement"}'),
  
  -- COMMUNITY
  ('generous', 'Généreux', 'A offert 1000 points de cadeaux', '💝', 'community', 2, 150, 0, '{"type": "sum", "target": 1000, "metric": "gifts_sent_points"}'),
  ('loyal_viewer', 'Spectateur Fidèle', 'A assisté à 50 beefs', '🎭', 'community', 1, 100, 20, '{"type": "count", "target": 50, "metric": "beefs_attended"}'),
  ('supporter', 'Supporter', 'A offert un cadeau Légende (100+ pts)', '⭐', 'community', 2, 100, 25, '{"type": "single", "target": 100, "metric": "single_gift_amount"}'),
  
  -- CREATION
  ('creator', 'Créateur', 'A organisé 5 beefs', '🎬', 'creation', 1, 100, 30, '{"type": "count", "target": 5, "metric": "beefs_created"}'),
  ('viral', 'Viral', 'Son beef a eu +1000 viewers', '📈', 'creation', 3, 500, 200, '{"type": "single", "target": 1000, "metric": "beef_viewers"}'),
  ('connector', 'Connecteur', 'A invité 10 amis actifs', '👥', 'creation', 2, 200, 50, '{"type": "count", "target": 10, "metric": "referrals_active"}'),
  
  -- PREMIUM
  ('premium_founder', 'Premium Founder', 'Membre premium depuis 6 mois', '👑', 'premium', 3, 300, 0, '{"type": "duration", "target": 180, "metric": "premium_days"}'),
  ('early_supporter', 'Early Supporter', 'A acheté des points le 1er mois', '💰', 'premium', 2, 150, 50, '{"type": "date", "target": "2026-04-01", "metric": "first_purchase_date"}'),
  ('vip', 'VIP', 'A assisté à 10 beefs premium', '🔥', 'premium', 2, 150, 0, '{"type": "count", "target": 10, "metric": "premium_beefs_attended"}')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 5. USER ACHIEVEMENTS (Unlocked)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT REFERENCES achievement_types(id),
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  progress JSONB DEFAULT '{}', -- current progress toward achievement
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_unlocked_at ON user_achievements(unlocked_at DESC);

-- =====================================================
-- 6. USER STATS (XP & Levels)
-- =====================================================

-- Add gamification columns to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_date DATE,
  ADD COLUMN IF NOT EXISTS total_gifts_sent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gifts_received INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beefs_attended INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beefs_created INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beefs_mediated INTEGER DEFAULT 0;

-- =====================================================
-- 7. SUBSCRIPTIONS (Premium Pass)
-- =====================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_type TEXT DEFAULT 'premium', -- 'premium', 'vip' (future)
  status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'expired', 'paused'
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- =====================================================
-- 8. BEEF ACCESS (Track who can access premium beefs)
-- =====================================================

CREATE TABLE IF NOT EXISTS beef_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES beefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_type TEXT NOT NULL, -- 'paid', 'subscription', 'free', 'creator'
  points_spent INTEGER DEFAULT 0, -- if paid with points
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(beef_id, user_id)
);

CREATE INDEX idx_beef_access_beef_id ON beef_access(beef_id);
CREATE INDEX idx_beef_access_user_id ON beef_access(user_id);

-- =====================================================
-- 9. FUNCTIONS
-- =====================================================

-- Calculate user level based on XP
CREATE OR REPLACE FUNCTION calculate_level(xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- Level thresholds: 0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200, 6600, ...
  -- Formula: level = floor(sqrt(xp / 100))
  RETURN GREATEST(1, FLOOR(SQRT(xp / 100.0))::INTEGER);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add XP to user and update level
CREATE OR REPLACE FUNCTION add_xp_to_user(
  p_user_id UUID,
  p_xp_amount INTEGER,
  p_source TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_old_xp INTEGER;
  v_new_xp INTEGER;
  v_old_level INTEGER;
  v_new_level INTEGER;
  v_result JSONB;
BEGIN
  -- Get current XP and level
  SELECT xp, level INTO v_old_xp, v_old_level
  FROM users
  WHERE id = p_user_id;
  
  -- Calculate new XP and level
  v_new_xp := v_old_xp + p_xp_amount;
  v_new_level := calculate_level(v_new_xp);
  
  -- Update user
  UPDATE users
  SET 
    xp = v_new_xp,
    level = v_new_level,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Build result
  v_result := jsonb_build_object(
    'old_xp', v_old_xp,
    'new_xp', v_new_xp,
    'xp_gained', p_xp_amount,
    'old_level', v_old_level,
    'new_level', v_new_level,
    'level_up', v_new_level > v_old_level,
    'source', p_source
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Update user balance and create transaction
CREATE OR REPLACE FUNCTION update_user_balance(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
  v_old_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Get current balance
  SELECT points INTO v_old_balance
  FROM users
  WHERE id = p_user_id;
  
  -- Calculate new balance
  v_new_balance := v_old_balance + p_amount;
  
  -- Prevent negative balance (except for refunds)
  IF v_new_balance < 0 AND p_type != 'refund' THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  -- Update user balance
  UPDATE users
  SET 
    points = v_new_balance,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- Create transaction record
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    balance_after,
    description,
    metadata
  ) VALUES (
    p_user_id,
    p_type,
    p_amount,
    v_new_balance,
    p_description,
    p_metadata
  ) RETURNING id INTO v_transaction_id;
  
  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'old_balance', v_old_balance,
    'new_balance', v_new_balance,
    'amount', p_amount
  );
END;
$$ LANGUAGE plpgsql;

-- Distribute gift revenue (70% mediator, 30% platform)
CREATE OR REPLACE FUNCTION distribute_gift_revenue(
  p_gift_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_gift RECORD;
  v_beef RECORD;
  v_mediator_amount INTEGER;
  v_platform_amount INTEGER;
  v_distribution JSONB;
BEGIN
  -- Get gift details
  SELECT * INTO v_gift
  FROM gifts
  WHERE id = p_gift_id;
  
  -- Get beef details (to find mediator)
  SELECT * INTO v_beef
  FROM beefs
  WHERE id = v_gift.beef_id;
  
  -- Calculate distribution (70% mediator, 30% platform)
  v_mediator_amount := FLOOR(v_gift.points_amount * 0.70);
  v_platform_amount := v_gift.points_amount - v_mediator_amount;
  
  -- Credit mediator
  PERFORM update_user_balance(
    v_beef.mediator_id,
    v_mediator_amount,
    'gift_received',
    'Cadeau reçu: ' || (SELECT name FROM gift_types WHERE id = v_gift.gift_type_id),
    jsonb_build_object(
      'gift_id', p_gift_id,
      'beef_id', v_gift.beef_id,
      'sender_id', v_gift.sender_id
    )
  );
  
  -- Update recipient_id to mediator for tracking
  UPDATE gifts
  SET recipient_id = v_beef.mediator_id
  WHERE id = p_gift_id;
  
  -- Build distribution summary
  v_distribution := jsonb_build_object(
    'total', v_gift.points_amount,
    'mediator', jsonb_build_object(
      'user_id', v_beef.mediator_id,
      'amount', v_mediator_amount,
      'percentage', 70
    ),
    'platform', jsonb_build_object(
      'amount', v_platform_amount,
      'percentage', 30
    )
  );
  
  RETURN v_distribution;
END;
$$ LANGUAGE plpgsql;

-- Check if user has access to premium beef
CREATE OR REPLACE FUNCTION user_has_beef_access(
  p_user_id UUID,
  p_beef_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_beef RECORD;
  v_has_subscription BOOLEAN;
  v_has_paid_access BOOLEAN;
  v_is_creator BOOLEAN;
BEGIN
  -- Get beef details
  SELECT * INTO v_beef
  FROM beefs
  WHERE id = p_beef_id;
  
  -- If beef is not premium, everyone has access
  IF NOT v_beef.is_premium THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is mediator or participant
  SELECT EXISTS (
    SELECT 1 FROM beefs WHERE id = p_beef_id AND mediator_id = p_user_id
    UNION
    SELECT 1 FROM beef_participants WHERE beef_id = p_beef_id AND user_id = p_user_id
  ) INTO v_is_creator;
  
  IF v_is_creator THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has active subscription
  SELECT EXISTS (
    SELECT 1
    FROM subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND current_period_end > NOW()
  ) INTO v_has_subscription;
  
  IF v_has_subscription THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has paid for this specific beef
  SELECT EXISTS (
    SELECT 1
    FROM beef_access
    WHERE user_id = p_user_id AND beef_id = p_beef_id
  ) INTO v_has_paid_access;
  
  RETURN v_has_paid_access;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 10. TRIGGERS
-- =====================================================

-- Trigger to auto-update updated_at on subscriptions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beef_access ENABLE ROW LEVEL SECURITY;

-- Transactions policies
CREATE POLICY "Users can view their own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Gifts policies
CREATE POLICY "Users can view gifts in beefs they have access to"
  ON gifts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM beef_access
      WHERE beef_id = gifts.beef_id AND user_id = auth.uid()
    ) OR
    sender_id = auth.uid() OR
    recipient_id = auth.uid()
  );

CREATE POLICY "Users can send gifts"
  ON gifts FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- User achievements policies
CREATE POLICY "Users can view their own achievements"
  ON user_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view others' achievements"
  ON user_achievements FOR SELECT
  USING (true); -- Public

-- Subscriptions policies
CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Beef access policies
CREATE POLICY "Users can view their own beef access"
  ON beef_access FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can grant beef access"
  ON beef_access FOR INSERT
  WITH CHECK (true);

-- Gift types & Achievement types are public read-only
ALTER TABLE gift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view gift types"
  ON gift_types FOR SELECT
  USING (is_active = true);

CREATE POLICY "Anyone can view achievement types"
  ON achievement_types FOR SELECT
  USING (is_active = true);

-- =====================================================
-- 12. COMMENTS
-- =====================================================

COMMENT ON TABLE transactions IS 'User points transactions history';
COMMENT ON TABLE gift_types IS 'Catalog of available gifts';
COMMENT ON TABLE gifts IS 'Gifts sent during beefs';
COMMENT ON TABLE achievement_types IS 'Catalog of achievements';
COMMENT ON TABLE user_achievements IS 'Achievements unlocked by users';
COMMENT ON TABLE subscriptions IS 'Premium subscription management';
COMMENT ON TABLE beef_access IS 'Tracks user access to premium beefs';

COMMENT ON FUNCTION calculate_level IS 'Calculate user level from XP';
COMMENT ON FUNCTION add_xp_to_user IS 'Add XP to user and update level';
COMMENT ON FUNCTION update_user_balance IS 'Update user points balance';
COMMENT ON FUNCTION distribute_gift_revenue IS 'Distribute gift revenue between mediator and platform';
COMMENT ON FUNCTION user_has_beef_access IS 'Check if user has access to a beef';
-- Add Stripe customer ID column to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe Customer ID for billing';
-- ==========================================
-- ADD TAGS COLUMN TO BEEFS
-- ==========================================

-- Add tags column to beefs table (JSON array)
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add index for tag search
CREATE INDEX IF NOT EXISTS idx_beefs_tags ON beefs USING GIN(tags);

-- Also add scheduled_at column for programmed beefs
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

-- Add index for scheduled beefs
CREATE INDEX IF NOT EXISTS idx_beefs_scheduled ON beefs(scheduled_at) WHERE scheduled_at IS NOT NULL;
-- ==========================================
-- CREATE ROOMS TABLE FOR LIVE BEEFS
-- ==========================================

-- Create rooms table (simplified version for live beefs)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Basic Info
  title TEXT NOT NULL,
  host_name TEXT NOT NULL,
  host_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('scheduled', 'live', 'ended', 'replay')),
  
  -- Tags system
  tags TEXT[] DEFAULT '{}',
  
  -- Premium
  is_premium BOOLEAN DEFAULT false,
  price DECIMAL(10, 2) DEFAULT 0,
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE,
  
  -- Session Info
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  
  -- Stats
  viewer_count INTEGER DEFAULT 0,
  max_viewers INTEGER DEFAULT 0,
  
  -- Daily.co room
  daily_room_url TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_tags ON rooms USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_rooms_scheduled ON rooms(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at DESC);

-- Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public rooms viewable" ON rooms
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their rooms" ON rooms
  FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their rooms" ON rooms
  FOR DELETE USING (auth.uid() = host_id);

-- Trigger for updated_at
CREATE TRIGGER update_rooms_updated_at
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
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
-- ==========================================
-- ADD RESOLUTION STATUS TO BEEFS
-- ==========================================

-- Add resolution_status column to track mediation outcomes
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS resolution_status TEXT 
  CHECK (resolution_status IN ('resolved', 'unresolved', 'in_progress', 'abandoned'));

-- Add comment for clarity
COMMENT ON COLUMN beefs.resolution_status IS 
  'Outcome of the mediation: resolved (success), unresolved (failed), in_progress (ongoing), abandoned (cancelled)';

-- Create index for resolution status queries
CREATE INDEX IF NOT EXISTS idx_beefs_resolution_status ON beefs(resolution_status);

-- Update existing beefs based on current status
UPDATE beefs 
SET resolution_status = CASE
  WHEN status = 'ended' THEN 'resolved'  -- Assume ended beefs are resolved by default
  WHEN status = 'live' OR status = 'ready' OR status = 'scheduled' THEN 'in_progress'
  WHEN status = 'cancelled' THEN 'abandoned'
  ELSE 'in_progress'
END
WHERE resolution_status IS NULL;
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
