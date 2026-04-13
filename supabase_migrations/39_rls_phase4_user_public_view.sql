-- Phase 4 — Annuaire « profil public » sans fuite email / rôle / ban / Stripe côté SELECT inter-comptes.
-- La vue est lue avec les droits du propriétaire (security_invoker = false) : pas de RLS sur users
-- pour cette lecture, mais uniquement les colonnes listées (pas d’email, phone, stripe, role, etc.).

-- ─── Vue : colonnes publiquement affichables ───
DROP VIEW IF EXISTS public.user_public_profile;

CREATE VIEW public.user_public_profile
WITH (security_invoker = false) AS
SELECT
  u.id,
  u.created_at,
  u.updated_at,
  u.username,
  u.display_name,
  u.bio,
  u.avatar_url,
  u.banner_url,
  u.accent_color,
  u.display_preferences,
  u.points,
  u.level,
  u.total_beefs_completed,
  u.average_rating,
  u.xp,
  u.streak_days,
  u.last_activity_date,
  u.total_gifts_sent,
  u.total_gifts_received,
  u.beefs_attended,
  u.beefs_created,
  u.beefs_mediated,
  u.is_premium,
  u.premium_until,
  u.premium_settings,
  u.badges,
  u.is_verified,
  u.privacy_settings
FROM public.users u;

ALTER VIEW public.user_public_profile OWNER TO postgres;

COMMENT ON VIEW public.user_public_profile IS
  'Profils utilisateurs — colonnes sûres pour annuaire / embeds. Lecture via propriétaire (hors RLS users).';

REVOKE ALL ON public.user_public_profile FROM PUBLIC;
GRANT SELECT ON public.user_public_profile TO authenticated;
GRANT SELECT ON public.user_public_profile TO service_role;

-- ─── users : fin du SELECT large pour les comptes non-admin ───
DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;

CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- « Admins manage all users » (31) reste en FOR ALL et s’applique en plus (OR).

-- ─── rooms : plus de liste publique anonyme ───
DROP POLICY IF EXISTS "Public rooms viewable" ON public.rooms;

CREATE POLICY "rooms_select_authenticated"
  ON public.rooms
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─── catalogues cadeaux / succès : réservés aux sessions authentifiées ───
DROP POLICY IF EXISTS "Anyone can view gift types" ON public.gift_types;

CREATE POLICY "gift_types_select_authenticated"
  ON public.gift_types
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

DROP POLICY IF EXISTS "Anyone can view achievement types" ON public.achievement_types;

CREATE POLICY "achievement_types_select_authenticated"
  ON public.achievement_types
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

-- ─── user_achievements : une seule politique SELECT pour authenticated ───
DROP POLICY IF EXISTS "Users can view their own achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can view others' achievements" ON public.user_achievements;

CREATE POLICY "user_achievements_select_authenticated"
  ON public.user_achievements
  FOR SELECT
  USING (auth.role() = 'authenticated');
