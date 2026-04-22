-- ============================================================================
--  BEEFS — INIT.SQL : schéma complet pour base Supabase fraîche
--  Généré depuis le code applicatif (49 migrations consolidées).
--
--  À coller dans Supabase → SQL Editor → Run.
--  Idempotent : peut être rejoué (IF NOT EXISTS, DROP POLICY IF EXISTS, etc.).
--
--  NOTE DE NOMMAGE
--  ---------------
--  Dans le brief « host_id » désigne le créateur de la ligne beef.
--  Dans le code ce champ s'appelle `beefs.created_by` (UUID users.id).
--  Le champ `beefs.mediator_id` (nullable) est le médiateur (créateur en mode
--  mediation, null en mode manifesto jusqu'à prise en charge).
--
--  Les RLS respectent le brief :
--   - beefs.INSERT        → auth.uid() = created_by    (= « host_id »)
--   - beefs.SELECT        → public (authenticated + anon autorisés)
--   - beefs.UPDATE        → auth.uid() = mediator_id OR auth.uid() = created_by
--   - beef_participants.INSERT (hybride) :
--       auth.uid() = user_id ET (
--           créateur du beef   OU
--           file d'attente : invite_status='pending' AND is_main=false
--           sur un beef status='live'
--       )
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. TABLE users — profil applicatif lié à auth.users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Identité
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  accent_color TEXT DEFAULT '#E83A14',
  phone TEXT,

  -- Gamification
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_activity_date DATE,
  total_beefs_completed INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,
  total_gifts_sent INTEGER DEFAULT 0,
  total_gifts_received INTEGER DEFAULT 0,
  beefs_attended INTEGER DEFAULT 0,
  beefs_created INTEGER DEFAULT 0,
  beefs_mediated INTEGER DEFAULT 0,

  -- Premium
  is_premium BOOLEAN DEFAULT false,
  premium_until TIMESTAMPTZ,
  premium_settings JSONB DEFAULT '{"showPremiumBadge": true, "showPremiumFrame": true, "showPremiumAnimations": true}'::jsonb,

  -- Badges / vérification
  badges TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  banned_until TIMESTAMPTZ,
  ban_reason TEXT,

  -- Stripe
  stripe_customer_id TEXT UNIQUE,

  -- Rôle et préférences
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
  notification_settings JSONB DEFAULT '{}'::jsonb,
  privacy_settings JSONB DEFAULT '{}'::jsonb,
  display_preferences JSONB DEFAULT '{"theme": "dark", "fontSize": "normal", "reduceAnimations": false, "highContrast": false}'::jsonb,

  -- Onboarding OAuth
  needs_arena_username BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(lower(username));
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON public.users(stripe_customer_id);

-- ============================================================================
-- 3. TABLE beefs — ring principal
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Identité du ring
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Créateur / médiateur (« host_id » = created_by)
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  mediator_id UUID REFERENCES public.users(id) ON DELETE CASCADE,

  intent TEXT NOT NULL DEFAULT 'mediation' CHECK (intent IN ('manifesto', 'mediation')),
  event_type TEXT NOT NULL DEFAULT 'standard' CHECK (event_type IN ('standard', 'prestige')),

  -- Contexte
  origin TEXT,
  conflict_date DATE,
  tags TEXT[] DEFAULT '{}',

  -- Cycle de vie
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'live', 'ended', 'cancelled', 'scheduled', 'replay')),
  resolution_status TEXT
    CHECK (resolution_status IN ('resolved', 'unresolved', 'in_progress', 'abandoned')),

  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,

  -- Monétisation
  is_premium BOOLEAN DEFAULT false,
  price DECIMAL(10, 2) DEFAULT 0,
  free_preview_minutes INTEGER DEFAULT 10
    CHECK (free_preview_minutes IS NULL OR (free_preview_minutes >= 0 AND free_preview_minutes <= 120)),

  -- Stats live
  viewer_count INTEGER DEFAULT 0,
  max_viewers INTEGER DEFAULT 0,
  tension_level INTEGER DEFAULT 0,
  total_gifts_received INTEGER DEFAULT 0,

  -- Admin / feed
  is_featured BOOLEAN DEFAULT false,
  feed_position INTEGER DEFAULT 0,
  mediation_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_beefs_mediator ON public.beefs(mediator_id);
CREATE INDEX IF NOT EXISTS idx_beefs_created_by ON public.beefs(created_by);
CREATE INDEX IF NOT EXISTS idx_beefs_status ON public.beefs(status);
CREATE INDEX IF NOT EXISTS idx_beefs_tags ON public.beefs USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_beefs_scheduled ON public.beefs(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_beefs_featured ON public.beefs(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_beefs_feed_position ON public.beefs(feed_position);
CREATE INDEX IF NOT EXISTS idx_beefs_resolution_status ON public.beefs(resolution_status);

-- ============================================================================
-- 4. TABLE beef_participants — liaison ring / utilisateurs (roles, statuts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beef_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  beef_id UUID NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'witness')),
  is_main BOOLEAN DEFAULT true,

  invite_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (invite_status IN ('pending', 'accepted', 'declined')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,

  is_present BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  is_speaking BOOLEAN DEFAULT false,
  speaking_time_seconds INTEGER DEFAULT 0,

  UNIQUE (beef_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_beef_participants_beef ON public.beef_participants(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_participants_user ON public.beef_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_beef_participants_status ON public.beef_participants(invite_status);

-- ============================================================================
-- 5. TABLE beef_invitations — invitations explicites
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beef_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  beef_id UUID NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  personal_message TEXT,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'seen', 'accepted', 'declined', 'expired')),
  seen_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),

  UNIQUE (beef_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_beef_invitations_beef ON public.beef_invitations(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_invitations_invitee ON public.beef_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_beef_invitations_status ON public.beef_invitations(status);

-- ============================================================================
-- 6. TABLE beef_messages — chat live
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beef_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beef_messages_beef_id ON public.beef_messages(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_messages_user_id ON public.beef_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_beef_messages_created_at ON public.beef_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beef_messages_pinned ON public.beef_messages(is_pinned) WHERE is_pinned = true;

-- ============================================================================
-- 7. TABLE beef_reactions — emojis broadcast
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.beef_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beef_id UUID NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beef_reactions_beef ON public.beef_reactions(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_reactions_user_id ON public.beef_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_beef_reactions_created ON public.beef_reactions(created_at);

-- ============================================================================
-- 8. TABLE followers — suivi
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.followers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  follower_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_followers_follower ON public.followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON public.followers(following_id);

-- ============================================================================
-- 9. TABLE notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('follow', 'invite', 'beef_live', 'gift', 'message', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, is_read);

-- ============================================================================
-- 10. TABLES conversations + direct_messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  participant_1 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_2 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  UNIQUE(participant_1, participant_2)
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON public.conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON public.conversations(participant_2);
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON public.direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_sender ON public.direct_messages(sender_id);

-- ============================================================================
-- 11. TABLES monétisation / gamification
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS public.gift_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  price INTEGER NOT NULL,
  animation_url TEXT,
  tier INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES public.beefs(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  gift_type_id TEXT REFERENCES public.gift_types(id),
  points_amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gifts_beef_id ON public.gifts(beef_id);
CREATE INDEX IF NOT EXISTS idx_gifts_sender_id ON public.gifts(sender_id);
CREATE INDEX IF NOT EXISTS idx_gifts_recipient_id ON public.gifts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_gifts_created_at ON public.gifts(created_at DESC);

CREATE TABLE IF NOT EXISTS public.achievement_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL,
  category TEXT NOT NULL,
  tier INTEGER DEFAULT 1,
  xp_reward INTEGER DEFAULT 0,
  points_reward INTEGER DEFAULT 0,
  requirement JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id TEXT REFERENCES public.achievement_types(id),
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  progress JSONB DEFAULT '{}',
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked_at ON public.user_achievements(unlocked_at DESC);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  plan_type TEXT DEFAULT 'premium',
  status TEXT DEFAULT 'active',
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

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON public.subscriptions(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS public.beef_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  access_type TEXT NOT NULL,
  points_spent INTEGER DEFAULT 0,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(beef_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_beef_access_beef_id ON public.beef_access(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_access_user_id ON public.beef_access(user_id);

-- ============================================================================
-- 12. TABLES modération / signalement / retraits
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.banned_words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word TEXT NOT NULL UNIQUE,
  severity TEXT DEFAULT 'moderate',
  action TEXT DEFAULT 'filter',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banned_words_word ON public.banned_words(word) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.user_timeouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  moderator_id UUID REFERENCES public.users(id),
  reason TEXT,
  duration_seconds INTEGER DEFAULT 60,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(beef_id, user_id, created_at)
);

CREATE INDEX IF NOT EXISTS idx_user_timeouts_beef_user ON public.user_timeouts(beef_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_timeouts_expires_at ON public.user_timeouts(expires_at);

CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('harassment', 'hate_speech', 'violence', 'spam', 'inappropriate', 'other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON public.user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON public.user_reports(status);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);

CREATE TABLE IF NOT EXISTS public.banned_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  reason TEXT,
  banned_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_points INTEGER NOT NULL CHECK (amount_points >= 2000),
  amount_euros DECIMAL(10,2) NOT NULL CHECK (amount_euros >= 20.00),
  method TEXT NOT NULL CHECK (method IN ('iban', 'paypal', 'orange_money', 'wave', 'mtn')),
  iban TEXT,
  account_holder_name TEXT,
  paypal_email TEXT,
  mobile_number TEXT,
  mobile_operator TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'rejected')),
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user_id ON public.withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON public.withdrawal_requests(status);

CREATE TABLE IF NOT EXISTS public.mediator_viewer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  beef_id UUID NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  mediator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  CONSTRAINT mvr_one_per_beef_reviewer UNIQUE (beef_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_mvr_mediator ON public.mediator_viewer_reviews(mediator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mvr_beef ON public.mediator_viewer_reviews(beef_id);

-- ============================================================================
-- 13. TABLE admin_settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_settings (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  view_mode TEXT DEFAULT 'admin' CHECK (view_mode IN ('admin', 'user', 'mediator', 'challenger')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 14. VUE user_public_profile — annuaire sans fuite email/phone/stripe/role
-- ============================================================================
DROP VIEW IF EXISTS public.user_public_profile;
CREATE VIEW public.user_public_profile
WITH (security_invoker = false) AS
SELECT
  u.id, u.created_at, u.updated_at, u.username, u.display_name, u.bio,
  u.avatar_url, u.banner_url, u.accent_color, u.display_preferences,
  u.points, u.level, u.total_beefs_completed, u.average_rating, u.xp,
  u.streak_days, u.last_activity_date, u.total_gifts_sent, u.total_gifts_received,
  u.beefs_attended, u.beefs_created, u.beefs_mediated,
  u.is_premium, u.premium_until, u.premium_settings, u.badges, u.is_verified,
  u.privacy_settings
FROM public.users u;

ALTER VIEW public.user_public_profile OWNER TO postgres;
REVOKE ALL ON public.user_public_profile FROM PUBLIC;
GRANT SELECT ON public.user_public_profile TO authenticated;
GRANT SELECT ON public.user_public_profile TO service_role;

-- ============================================================================
-- 15. FONCTIONS : updated_at generic + helpers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated, service_role;

-- ============================================================================
-- 16. TRIGGERS updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_beefs_updated_at ON public.beefs;
CREATE TRIGGER trg_beefs_updated_at BEFORE UPDATE ON public.beefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_beef_messages_updated_at ON public.beef_messages;
CREATE TRIGGER trg_beef_messages_updated_at BEFORE UPDATE ON public.beef_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 17. TRIGGER : enforcement profil self-update (colonnes "serveur" figées)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_users_safe_self_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_app_admin() THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Mise à jour de profil réservée au compte connecté';
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.email := OLD.email;
  NEW.username := OLD.username;
  NEW.phone := OLD.phone;
  NEW.points := OLD.points;
  NEW.level := OLD.level;
  NEW.total_beefs_completed := OLD.total_beefs_completed;
  NEW.average_rating := OLD.average_rating;
  NEW.xp := OLD.xp;
  NEW.streak_days := OLD.streak_days;
  NEW.last_activity_date := OLD.last_activity_date;
  NEW.total_gifts_sent := OLD.total_gifts_sent;
  NEW.total_gifts_received := OLD.total_gifts_received;
  NEW.beefs_attended := OLD.beefs_attended;
  NEW.beefs_created := OLD.beefs_created;
  NEW.beefs_mediated := OLD.beefs_mediated;
  NEW.is_premium := OLD.is_premium;
  NEW.premium_until := OLD.premium_until;
  NEW.badges := OLD.badges;
  NEW.is_verified := OLD.is_verified;
  NEW.is_banned := OLD.is_banned;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.notification_settings := OLD.notification_settings;
  NEW.role := OLD.role;
  NEW.banned_until := OLD.banned_until;
  NEW.ban_reason := OLD.ban_reason;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_users_safe_self_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_users_safe_self_update ON public.users;
CREATE TRIGGER enforce_users_safe_self_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_users_safe_self_update();

-- ============================================================================
-- 18. FONCTIONS métier (appelées par le code front / API)
-- ============================================================================

-- Balance / transactions
CREATE OR REPLACE FUNCTION public.update_user_balance(
  p_user_id UUID, p_amount INTEGER, p_type TEXT,
  p_description TEXT, p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_old INTEGER; v_new INTEGER; v_tx UUID;
BEGIN
  SELECT points INTO v_old FROM public.users WHERE id = p_user_id;
  v_new := v_old + p_amount;
  IF v_new < 0 AND p_type != 'refund' THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  UPDATE public.users SET points = v_new, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.transactions (user_id, type, amount, balance_after, description, metadata)
    VALUES (p_user_id, p_type, p_amount, v_new, p_description, p_metadata)
    RETURNING id INTO v_tx;
  RETURN jsonb_build_object('transaction_id', v_tx, 'old_balance', v_old, 'new_balance', v_new, 'amount', p_amount);
END; $$;

-- Compteurs live
CREATE OR REPLACE FUNCTION public.increment_viewer_count(beef_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN UPDATE public.beefs SET viewer_count = COALESCE(viewer_count, 0) + 1 WHERE id = beef_id; END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_viewer_count(beef_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN UPDATE public.beefs SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0) WHERE id = beef_id; END;
$$;

CREATE OR REPLACE FUNCTION public.increment_tension(room_id UUID, increment_value INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN UPDATE public.beefs SET tension_level = LEAST(100, COALESCE(tension_level, 0) + increment_value) WHERE id = room_id; END;
$$;

-- Conversation get_or_create
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(user_a UUID, user_b UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE conv_id UUID; p1 UUID; p2 UUID;
BEGIN
  IF user_a < user_b THEN p1 := user_a; p2 := user_b;
  ELSE p1 := user_b; p2 := user_a; END IF;
  SELECT id INTO conv_id FROM public.conversations WHERE participant_1 = p1 AND participant_2 = p2;
  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (participant_1, participant_2) VALUES (p1, p2) RETURNING id INTO conv_id;
  END IF;
  RETURN conv_id;
END; $$;

-- Stats profils
CREATE OR REPLACE FUNCTION public.get_user_beefs_count(user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INTEGER FROM public.beefs WHERE mediator_id = user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_followers_count(user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INTEGER FROM public.followers WHERE following_id = user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_following_count(user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::INTEGER FROM public.followers WHERE follower_id = user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_following(follower UUID, following UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.followers WHERE follower_id = follower AND following_id = following);
$$;

-- Badges header
CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.notifications
  WHERE user_id = auth.uid() AND is_read IS DISTINCT FROM true;
$$;
REVOKE ALL ON FUNCTION public.count_unread_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.count_unread_direct_messages()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.direct_messages dm
  INNER JOIN public.conversations c ON c.id = dm.conversation_id
  WHERE (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    AND dm.sender_id <> auth.uid()
    AND dm.is_deleted IS NOT TRUE
    AND dm.is_read IS DISTINCT FROM true;
$$;
REVOKE ALL ON FUNCTION public.count_unread_direct_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_direct_messages() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.notifications SET is_read = true
  WHERE user_id = auth.uid() AND is_read IS DISTINCT FROM true;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications SET is_read = true
  WHERE id = p_id AND user_id = auth.uid();
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated, service_role;

-- RPC signup / login (sans session)
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.users u WHERE lower(u.username) = lower(trim(p_username)));
$$;
REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.login_precheck(p_identifier text)
RETURNS TABLE (found boolean, email text, is_banned boolean, banned_until timestamptz, ban_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trim text := trim(p_identifier); v_email text; v_row public.users%ROWTYPE;
BEGIN
  IF v_trim IS NULL OR v_trim = '' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::text; RETURN;
  END IF;
  IF position('@' in v_trim) > 0 THEN v_email := v_trim;
  ELSE SELECT u.email INTO v_email FROM public.users u WHERE lower(u.username) = lower(v_trim) LIMIT 1;
  END IF;
  IF v_email IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::text; RETURN;
  END IF;
  SELECT * INTO v_row FROM public.users u WHERE lower(u.email) = lower(v_email) LIMIT 1;
  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::text; RETURN;
  END IF;
  RETURN QUERY SELECT true, v_row.email, COALESCE(v_row.is_banned, false), v_row.banned_until, v_row.ban_reason;
END; $$;
REVOKE ALL ON FUNCTION public.login_precheck(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_precheck(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid, username text, display_name text, bio text, avatar_url text,
  points integer, is_premium boolean, created_at timestamptz, stats_shortcuts jsonb
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.username, u.display_name, u.bio, u.avatar_url, u.points,
         COALESCE(u.is_premium, false), u.created_at,
         (u.premium_settings -> 'statsShortcuts')
  FROM public.users u
  WHERE lower(u.username) = lower(trim(p_username))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO anon, authenticated;

-- Résumé terminal public
CREATE OR REPLACE FUNCTION public.get_public_terminal_beef_summary(p_beef_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', b.id, 'title', b.title, 'subject', b.subject, 'description', b.description,
    'status', b.status, 'created_at', b.created_at, 'started_at', b.started_at,
    'ended_at', b.ended_at, 'viewer_count', b.viewer_count, 'tags', b.tags,
    'mediator_id', b.mediator_id, 'mediator_username', u.username,
    'mediator_display_name', u.display_name
  )
  FROM public.beefs b
  LEFT JOIN public.users u ON u.id = b.mediator_id
  WHERE b.id = p_beef_id AND b.status IN ('ended', 'replay', 'cancelled')
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_terminal_beef_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_terminal_beef_summary(uuid) TO anon, authenticated;

-- Chat rate limiting / timeout helpers
CREATE OR REPLACE FUNCTION public.is_user_timed_out(p_beef_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v bool;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.user_timeouts
    WHERE beef_id = p_beef_id AND user_id = p_user_id AND expires_at > NOW()) INTO v;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.get_recent_message_count(p_user_id UUID, p_beef_id UUID, p_seconds INTEGER DEFAULT 10)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE c INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO c FROM public.beef_messages
    WHERE user_id = p_user_id AND beef_id = p_beef_id
      AND created_at > NOW() - (p_seconds || ' seconds')::INTERVAL;
  RETURN c;
END; $$;

-- ============================================================================
-- 19. TRIGGERS : notifications (DM / follow / invitation / beef live)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_new_dm()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE p1 uuid; p2 uuid; recipient uuid; sender_name text;
BEGIN
  SELECT participant_1, participant_2 INTO p1, p2 FROM public.conversations WHERE id = NEW.conversation_id;
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO sender_name FROM public.users WHERE id = NEW.sender_id;
  IF NEW.sender_id = p1 THEN recipient := p2; ELSE recipient := p1; END IF;
  IF recipient IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    VALUES (recipient, 'message', 'Nouveau message', sender_name || ' t''a envoyé un message',
            '/messages', jsonb_build_object('sender_id', NEW.sender_id, 'conversation_id', NEW.conversation_id));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trigger_notify_new_dm ON public.direct_messages;
CREATE TRIGGER trigger_notify_new_dm AFTER INSERT ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_dm();

CREATE OR REPLACE FUNCTION public.notify_new_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE follower_name text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO follower_name FROM public.users WHERE id = NEW.follower_id;
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (NEW.following_id, 'follow', 'Nouveau follower', follower_name || ' te suit maintenant',
          '/profile/' || (SELECT username FROM public.users WHERE id = NEW.follower_id),
          jsonb_build_object('follower_id', NEW.follower_id));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trigger_notify_new_follow ON public.followers;
CREATE TRIGGER trigger_notify_new_follow AFTER INSERT ON public.followers
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_follow();

CREATE OR REPLACE FUNCTION public.notify_beef_invitation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE inviter_name text; beef_title text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO inviter_name FROM public.users WHERE id = NEW.inviter_id;
  SELECT title INTO beef_title FROM public.beefs WHERE id = NEW.beef_id;
  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (NEW.invitee_id, 'invite', 'Invitation à un beef',
          inviter_name || ' t''invite à "' || COALESCE(beef_title, 'un beef') || '"',
          '/invitations', jsonb_build_object('beef_id', NEW.beef_id, 'inviter_id', NEW.inviter_id));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trigger_notify_beef_invitation ON public.beef_invitations;
CREATE TRIGGER trigger_notify_beef_invitation AFTER INSERT ON public.beef_invitations
  FOR EACH ROW EXECUTE FUNCTION public.notify_beef_invitation();

CREATE OR REPLACE FUNCTION public.notify_beef_live()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p_record RECORD; mediator_name text; v_presenter uuid;
BEGIN
  v_presenter := COALESCE(NEW.mediator_id, NEW.created_by);
  IF OLD.status IS DISTINCT FROM 'live' AND NEW.status = 'live' THEN
    IF v_presenter IS NOT NULL THEN
      SELECT COALESCE(display_name, username, 'Quelqu''un') INTO mediator_name FROM public.users WHERE id = v_presenter;
    ELSE mediator_name := 'Quelqu''un'; END IF;
    FOR p_record IN SELECT user_id FROM public.beef_participants WHERE beef_id = NEW.id AND user_id IS DISTINCT FROM v_presenter LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
      VALUES (p_record.user_id, 'beef_live', 'Beef en direct !',
              '"' || COALESCE(NEW.title, 'Un beef') || '" est en live !',
              '/arena/' || NEW.id, jsonb_build_object('beef_id', NEW.id));
    END LOOP;
    IF v_presenter IS NOT NULL THEN
      FOR p_record IN SELECT follower_id FROM public.followers WHERE following_id = v_presenter LOOP
        INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
        VALUES (p_record.follower_id, 'beef_live', 'Beef en direct !',
                COALESCE(mediator_name, 'Quelqu''un') || ' est en live : "' || COALESCE(NEW.title, 'Un beef') || '"',
                '/arena/' || NEW.id, jsonb_build_object('beef_id', NEW.id))
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trigger_notify_beef_live ON public.beefs;
CREATE TRIGGER trigger_notify_beef_live AFTER UPDATE ON public.beefs
  FOR EACH ROW EXECUTE FUNCTION public.notify_beef_live();

-- Auto passage beef pending → ready dès que tous les is_main ont accepté
CREATE OR REPLACE FUNCTION public.check_beef_ready(beef_id_param UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE total_main INTEGER; accepted_main INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_main FROM public.beef_participants
    WHERE beef_id = beef_id_param AND is_main = true;
  SELECT COUNT(*) INTO accepted_main FROM public.beef_participants
    WHERE beef_id = beef_id_param AND is_main = true AND invite_status = 'accepted';
  RETURN (total_main > 0 AND total_main = accepted_main);
END; $$;

CREATE OR REPLACE FUNCTION public.update_beef_status_on_acceptance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_status = 'accepted' AND OLD.invite_status != 'accepted' THEN
    IF public.check_beef_ready(NEW.beef_id) THEN
      UPDATE public.beefs SET status = 'ready' WHERE id = NEW.beef_id AND status = 'pending';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trigger_update_beef_status ON public.beef_participants;
CREATE TRIGGER trigger_update_beef_status AFTER UPDATE ON public.beef_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_beef_status_on_acceptance();

-- Refresh rating médiateur après avis spectateur
CREATE OR REPLACE FUNCTION public.tr_refresh_mediator_rating_from_viewer_reviews()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.mediator_id, OLD.mediator_id);
  IF target IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.users u
  SET average_rating = (
    SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)
    FROM public.mediator_viewer_reviews r WHERE r.mediator_id = target
  ) WHERE u.id = target;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS tr_mvr_refresh_mediator_rating ON public.mediator_viewer_reviews;
CREATE TRIGGER tr_mvr_refresh_mediator_rating
  AFTER INSERT OR DELETE OR UPDATE OF rating ON public.mediator_viewer_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tr_refresh_mediator_rating_from_viewer_reviews();

-- ============================================================================
-- 20. ROW LEVEL SECURITY : activation + policies
-- ============================================================================

ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beefs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_reactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gifts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_access        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_words       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_timeouts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_emails      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mediator_viewer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings     ENABLE ROW LEVEL SECURITY;

-- ─── users ───
DROP POLICY IF EXISTS "users_select_self" ON public.users;
CREATE POLICY "users_select_self" ON public.users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_self_safe" ON public.users;
CREATE POLICY "users_insert_self_safe" ON public.users
  FOR INSERT WITH CHECK (
    auth.uid() = id
    AND COALESCE(points, 0) = 0
    AND COALESCE(xp, 0) = 0
    AND COALESCE(is_premium, false) = false
    AND COALESCE(is_verified, false) = false
  );

DROP POLICY IF EXISTS "users_update_self" ON public.users;
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_admin_all" ON public.users;
CREATE POLICY "users_admin_all" ON public.users
  FOR ALL USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

-- ─── beefs ───
DROP POLICY IF EXISTS "beefs_select_public" ON public.beefs;
CREATE POLICY "beefs_select_public" ON public.beefs
  FOR SELECT USING (true);

-- INSERT : seul le créateur (host_id = created_by) peut insérer ; contrainte intent/mediator_id.
DROP POLICY IF EXISTS "beefs_insert_creator" ON public.beefs;
CREATE POLICY "beefs_insert_creator" ON public.beefs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = created_by
  );

-- UPDATE : médiateur OU créateur
DROP POLICY IF EXISTS "beefs_update_mediator_or_creator" ON public.beefs;
CREATE POLICY "beefs_update_mediator_or_creator" ON public.beefs
  FOR UPDATE USING (auth.uid() = mediator_id OR auth.uid() = created_by);

-- UPDATE : un non-créateur peut devenir médiateur d'un manifeste orphelin
DROP POLICY IF EXISTS "beefs_claim_orphan_manifesto" ON public.beefs;
CREATE POLICY "beefs_claim_orphan_manifesto" ON public.beefs
  FOR UPDATE
  USING (
    intent = 'manifesto' AND mediator_id IS NULL
    AND created_by IS NOT NULL AND created_by <> auth.uid()
  )
  WITH CHECK (mediator_id = auth.uid() AND intent = 'manifesto');

-- UPDATE : désistement médiateur d'un manifeste (retour pending/null)
DROP POLICY IF EXISTS "beefs_manifesto_mediator_withdraw" ON public.beefs;
CREATE POLICY "beefs_manifesto_mediator_withdraw" ON public.beefs
  FOR UPDATE
  USING (intent = 'manifesto' AND mediator_id = auth.uid())
  WITH CHECK (intent = 'manifesto' AND mediator_id IS NULL AND status = 'pending');

-- DELETE : médiateur OU créateur
DROP POLICY IF EXISTS "beefs_delete_mediator_or_creator" ON public.beefs;
CREATE POLICY "beefs_delete_mediator_or_creator" ON public.beefs
  FOR DELETE USING (auth.uid() = mediator_id OR auth.uid() = created_by);

-- Admin
DROP POLICY IF EXISTS "beefs_admin_update" ON public.beefs;
CREATE POLICY "beefs_admin_update" ON public.beefs
  FOR UPDATE USING (public.is_app_admin());
DROP POLICY IF EXISTS "beefs_admin_delete" ON public.beefs;
CREATE POLICY "beefs_admin_delete" ON public.beefs
  FOR DELETE USING (public.is_app_admin());

-- ─── beef_participants ───
DROP POLICY IF EXISTS "bp_select_public" ON public.beef_participants;
CREATE POLICY "bp_select_public" ON public.beef_participants
  FOR SELECT USING (true);

-- INSERT hybride : soit créateur ajoute un user, soit self-insert selon conditions.
DROP POLICY IF EXISTS "bp_insert_mediator_or_manifest_author" ON public.beef_participants;
CREATE POLICY "bp_insert_mediator_or_manifest_author" ON public.beef_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_id
        AND (
          b.mediator_id = auth.uid()
          OR (b.mediator_id IS NULL AND b.created_by = auth.uid() AND b.intent = 'manifesto')
        )
    )
  );

-- INSERT : self-insert hybride (créateur de la ligne OU file d'attente live)
DROP POLICY IF EXISTS "bp_insert_self_smart" ON public.beef_participants;
CREATE POLICY "bp_insert_self_smart" ON public.beef_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND (
      -- (a) Créateur du beef : peut s'auto-ajouter librement
      EXISTS (
        SELECT 1 FROM public.beefs b
        WHERE b.id = beef_participants.beef_id
          AND b.created_by = auth.uid()
      )
      -- (b) File d'attente ("waiting") : pending + non-main sur un beef live (pas le médiateur)
      OR (
        beef_participants.invite_status = 'pending'
        AND beef_participants.is_main = false
        AND EXISTS (
          SELECT 1 FROM public.beefs b
          WHERE b.id = beef_participants.beef_id
            AND b.status = 'live'
            AND b.mediator_id IS DISTINCT FROM auth.uid()
        )
      )
    )
  );

-- UPDATE : le participant gère son propre statut (accept / decline), médiateur pilote aussi
DROP POLICY IF EXISTS "bp_update_self" ON public.beef_participants;
CREATE POLICY "bp_update_self" ON public.beef_participants
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bp_update_mediator_or_creator" ON public.beef_participants;
CREATE POLICY "bp_update_mediator_or_creator" ON public.beef_participants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_id
        AND (b.mediator_id = auth.uid()
             OR (b.mediator_id IS NULL AND b.created_by = auth.uid()))
    )
  );

-- ─── beef_invitations ───
DROP POLICY IF EXISTS "bi_select_invitee" ON public.beef_invitations;
CREATE POLICY "bi_select_invitee" ON public.beef_invitations
  FOR SELECT USING (auth.uid() = invitee_id);

DROP POLICY IF EXISTS "bi_select_inviter" ON public.beef_invitations;
CREATE POLICY "bi_select_inviter" ON public.beef_invitations
  FOR SELECT USING (auth.uid() = inviter_id);

DROP POLICY IF EXISTS "bi_insert_mediator_or_author" ON public.beef_invitations;
CREATE POLICY "bi_insert_mediator_or_author" ON public.beef_invitations
  FOR INSERT WITH CHECK (
    auth.uid() = inviter_id
    AND EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_id
        AND (b.mediator_id = auth.uid()
             OR (b.mediator_id IS NULL AND b.created_by = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "bi_update_invitee" ON public.beef_invitations;
CREATE POLICY "bi_update_invitee" ON public.beef_invitations
  FOR UPDATE USING (auth.uid() = invitee_id);

-- ─── beef_messages ───
DROP POLICY IF EXISTS "bm_select_public" ON public.beef_messages;
CREATE POLICY "bm_select_public" ON public.beef_messages
  FOR SELECT USING (NOT is_deleted);

DROP POLICY IF EXISTS "bm_insert_self" ON public.beef_messages;
CREATE POLICY "bm_insert_self" ON public.beef_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_user_timed_out(beef_id, user_id)
    AND public.get_recent_message_count(user_id, beef_id, 10) < 10
  );

DROP POLICY IF EXISTS "bm_update_self_or_mediator" ON public.beef_messages;
CREATE POLICY "bm_update_self_or_mediator" ON public.beef_messages
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.beefs b WHERE b.id = beef_id AND b.mediator_id = auth.uid())
  );

DROP POLICY IF EXISTS "bm_delete_self" ON public.beef_messages;
CREATE POLICY "bm_delete_self" ON public.beef_messages
  FOR DELETE USING (auth.uid() = user_id);

-- ─── beef_reactions ───
DROP POLICY IF EXISTS "br_select_public" ON public.beef_reactions;
CREATE POLICY "br_select_public" ON public.beef_reactions
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "br_insert_self" ON public.beef_reactions;
CREATE POLICY "br_insert_self" ON public.beef_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── followers ───
DROP POLICY IF EXISTS "followers_select_public" ON public.followers;
CREATE POLICY "followers_select_public" ON public.followers
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "followers_insert_self" ON public.followers;
CREATE POLICY "followers_insert_self" ON public.followers
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
DROP POLICY IF EXISTS "followers_delete_self" ON public.followers;
CREATE POLICY "followers_delete_self" ON public.followers
  FOR DELETE USING (auth.uid() = follower_id);

-- ─── notifications ───
DROP POLICY IF EXISTS "notif_select_self" ON public.notifications;
CREATE POLICY "notif_select_self" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_insert_self" ON public.notifications;
CREATE POLICY "notif_insert_self" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_update_self" ON public.notifications;
CREATE POLICY "notif_update_self" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- ─── conversations / DMs ───
DROP POLICY IF EXISTS "conv_select_participant" ON public.conversations;
CREATE POLICY "conv_select_participant" ON public.conversations
  FOR SELECT USING (auth.uid() = participant_1 OR auth.uid() = participant_2);
DROP POLICY IF EXISTS "conv_insert_participant" ON public.conversations;
CREATE POLICY "conv_insert_participant" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = participant_1 OR auth.uid() = participant_2);
DROP POLICY IF EXISTS "conv_update_participant" ON public.conversations;
CREATE POLICY "conv_update_participant" ON public.conversations
  FOR UPDATE USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

DROP POLICY IF EXISTS "dm_select_in_conv" ON public.direct_messages;
CREATE POLICY "dm_select_in_conv" ON public.direct_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
            AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid()))
  );
DROP POLICY IF EXISTS "dm_insert_sender" ON public.direct_messages;
CREATE POLICY "dm_insert_sender" ON public.direct_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "dm_update_sender_or_recipient" ON public.direct_messages;
CREATE POLICY "dm_update_sender_or_recipient" ON public.direct_messages
  FOR UPDATE USING (
    auth.uid() = sender_id
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
               AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid()))
  );

-- ─── transactions / gifts / achievements / subscriptions / beef_access ───
DROP POLICY IF EXISTS "tx_select_self" ON public.transactions;
CREATE POLICY "tx_select_self" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "gift_types_select" ON public.gift_types;
CREATE POLICY "gift_types_select" ON public.gift_types
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);

DROP POLICY IF EXISTS "gifts_select_linked" ON public.gifts;
CREATE POLICY "gifts_select_linked" ON public.gifts
  FOR SELECT USING (
    sender_id = auth.uid() OR recipient_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.beef_access WHERE beef_id = gifts.beef_id AND user_id = auth.uid())
  );
DROP POLICY IF EXISTS "gifts_insert_sender" ON public.gifts;
CREATE POLICY "gifts_insert_sender" ON public.gifts
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "ach_types_select" ON public.achievement_types;
CREATE POLICY "ach_types_select" ON public.achievement_types
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);

DROP POLICY IF EXISTS "ua_select_auth" ON public.user_achievements;
CREATE POLICY "ua_select_auth" ON public.user_achievements
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "sub_select_self" ON public.subscriptions;
CREATE POLICY "sub_select_self" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ba_select_self" ON public.beef_access;
CREATE POLICY "ba_select_self" ON public.beef_access
  FOR SELECT USING (auth.uid() = user_id);

-- ─── modération / signalement ───
DROP POLICY IF EXISTS "ur_insert_self" ON public.user_reports;
CREATE POLICY "ur_insert_self" ON public.user_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "ur_select_self" ON public.user_reports;
CREATE POLICY "ur_select_self" ON public.user_reports
  FOR SELECT USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "ub_manage_self" ON public.user_blocks;
CREATE POLICY "ub_manage_self" ON public.user_blocks
  FOR ALL USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "be_select_any" ON public.banned_emails;
CREATE POLICY "be_select_any" ON public.banned_emails
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "ut_select_any" ON public.user_timeouts;
CREATE POLICY "ut_select_any" ON public.user_timeouts
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "ut_insert_mediator" ON public.user_timeouts;
CREATE POLICY "ut_insert_mediator" ON public.user_timeouts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.beefs WHERE id = beef_id AND mediator_id = auth.uid())
  );

-- ─── withdrawals ───
DROP POLICY IF EXISTS "wr_select_self" ON public.withdrawal_requests;
CREATE POLICY "wr_select_self" ON public.withdrawal_requests
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "wr_insert_self" ON public.withdrawal_requests;
CREATE POLICY "wr_insert_self" ON public.withdrawal_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── mediator_viewer_reviews ───
DROP POLICY IF EXISTS "mvr_select_public" ON public.mediator_viewer_reviews;
CREATE POLICY "mvr_select_public" ON public.mediator_viewer_reviews
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "mvr_insert_eligible_viewer" ON public.mediator_viewer_reviews;
CREATE POLICY "mvr_insert_eligible_viewer" ON public.mediator_viewer_reviews
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND auth.uid() = reviewer_id
    AND reviewer_id <> mediator_id
    AND EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_id AND b.mediator_id = mediator_id
        AND b.status IN ('ended', 'replay', 'cancelled')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.beef_participants p
      WHERE p.beef_id = beef_id AND p.user_id = reviewer_id AND p.invite_status = 'accepted'
    )
  );
GRANT SELECT ON public.mediator_viewer_reviews TO anon, authenticated;
GRANT INSERT ON public.mediator_viewer_reviews TO authenticated;

-- ─── admin_settings ───
DROP POLICY IF EXISTS "admin_settings_self" ON public.admin_settings;
CREATE POLICY "admin_settings_self" ON public.admin_settings
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- 21. REPLICA IDENTITY + REALTIME publications
-- ============================================================================
ALTER TABLE public.beefs              REPLICA IDENTITY FULL;
ALTER TABLE public.beef_participants  REPLICA IDENTITY FULL;
ALTER TABLE public.beef_invitations   REPLICA IDENTITY FULL;
ALTER TABLE public.beef_messages      REPLICA IDENTITY FULL;
ALTER TABLE public.beef_reactions     REPLICA IDENTITY FULL;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.beefs;             EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.beef_participants; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.beef_invitations;  EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.beef_messages;     EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.beef_reactions;    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;   EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;     EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- ============================================================================
-- 22. SEED minimal (catalogues)
-- ============================================================================
INSERT INTO public.gift_types (id, name, emoji, price, tier) VALUES
  ('rose', 'Rose', '🌹', 10, 1),
  ('fire', 'Fire', '🔥', 25, 1),
  ('diamond', 'Diamant', '💎', 50, 2),
  ('crown', 'Couronne', '👑', 100, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.banned_words (word, severity, action) VALUES
  ('spam', 'moderate', 'filter'),
  ('bot', 'low', 'filter')
ON CONFLICT (word) DO NOTHING;

-- ============================================================================
-- 23. STORAGE : bucket "avatars"
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "avatars_owner_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "avatars_owner_update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "avatars_owner_delete" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- FIN — init.sql
-- ============================================================================
