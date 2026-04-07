-- Colonnes attendues par public.enforce_users_safe_self_update() (migration 31 / 32).
-- Si la table `users` a été créée ou évolué hors du dépôt, certaines colonnes peuvent
-- manquer → erreur PostgreSQL 42703 : record "new" has no field "…".
-- Ce script est idempotent (IF NOT EXISTS).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_beefs_completed INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_activity_date DATE;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_gifts_sent INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_gifts_received INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS beefs_attended INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS beefs_created INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS beefs_mediated INTEGER DEFAULT 0;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_settings JSONB
  DEFAULT '{"showPremiumBadge": true, "showPremiumFrame": true, "showPremiumAnimations": true}'::jsonb;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}';

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
