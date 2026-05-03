-- Expose les URLs médias sources (migration 59) dans la vue profil et le RPC invité.
BEGIN;

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
  u.avatar_original_url,
  u.banner_original_url,
  u.accent_color,
  u.display_preferences,
  u.points,
  u.lifetime_points,
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
  u.privacy_settings,
  COALESCE(u.avatar_likes, 0) AS avatar_likes,
  COALESCE(u.banner_likes, 0) AS banner_likes
FROM public.users u;

ALTER VIEW public.user_public_profile OWNER TO postgres;
COMMENT ON VIEW public.user_public_profile IS
  'Profils utilisateurs — annuaire sûr (crop + médias sources, likes médias).';

REVOKE ALL ON public.user_public_profile FROM PUBLIC;
GRANT SELECT ON public.user_public_profile TO authenticated;
GRANT SELECT ON public.user_public_profile TO service_role;

DROP FUNCTION IF EXISTS public.get_public_profile_by_username(text);

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  avatar_original_url text,
  banner_original_url text,
  points integer,
  lifetime_points integer,
  is_premium boolean,
  created_at timestamptz,
  stats_shortcuts jsonb,
  avatar_likes integer,
  banner_likes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.username::text,
    u.display_name::text,
    u.bio::text,
    u.avatar_url::text,
    u.banner_url::text,
    u.avatar_original_url::text,
    u.banner_original_url::text,
    u.points,
    COALESCE(u.lifetime_points, 0)::integer,
    COALESCE(u.is_premium, false),
    u.created_at,
    (u.premium_settings -> 'statsShortcuts') AS stats_shortcuts,
    COALESCE(u.avatar_likes, 0)::integer,
    COALESCE(u.banner_likes, 0)::integer
  FROM public.users u
  WHERE lower(u.username::text) = lower(trim(p_username))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO authenticated;

COMMIT;
