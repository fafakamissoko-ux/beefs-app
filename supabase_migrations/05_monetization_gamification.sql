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
