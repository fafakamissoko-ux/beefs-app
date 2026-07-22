-- B-29 — Exposer is_banned dans la vue profil public pour filtrer l'Élite et la recherche

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
  COALESCE(u.beefs_resolved, 0) AS beefs_resolved,
  COALESCE(u.beefs_abandoned, 0) AS beefs_abandoned,
  u.is_premium,
  u.premium_until,
  u.premium_settings,
  u.badges,
  u.is_verified,
  COALESCE(u.is_banned, false) AS is_banned,
  u.privacy_settings,
  (
    SELECT count(*)::integer
    FROM public.profile_media_likes pml
    WHERE pml.media_owner_id = u.id AND pml.media_type = 'avatar'
  ) AS avatar_likes,
  (
    SELECT count(*)::integer
    FROM public.profile_media_likes pml
    WHERE pml.media_owner_id = u.id AND pml.media_type = 'banner'
  ) AS banner_likes
FROM public.users u;

ALTER VIEW public.user_public_profile OWNER TO postgres;
COMMENT ON VIEW public.user_public_profile IS
  'Profils utilisateurs — annuaire sûr (médias, likes, stats Sagesse, is_banned).';

REVOKE ALL ON public.user_public_profile FROM PUBLIC;
GRANT SELECT ON public.user_public_profile TO authenticated;
GRANT SELECT ON public.user_public_profile TO service_role;

COMMIT;
