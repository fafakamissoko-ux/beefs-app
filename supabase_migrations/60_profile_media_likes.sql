-- Likes médias profil public (avatar / bannière), compteurs sur users.maintenus par trigger.
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_likes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS banner_likes integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.profile_media_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  media_owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('avatar', 'banner')),
  CONSTRAINT profile_media_likes_unique UNIQUE (media_owner_id, user_id, media_type),
  CONSTRAINT profile_media_likes_no_self CHECK (media_owner_id <> user_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_media_likes_owner ON public.profile_media_likes (media_owner_id);
CREATE INDEX IF NOT EXISTS idx_profile_media_likes_user ON public.profile_media_likes (user_id);

CREATE OR REPLACE FUNCTION public.trg_profile_media_likes_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    IF NEW.media_type = 'avatar' THEN
      UPDATE public.users SET avatar_likes = COALESCE(avatar_likes, 0) + 1 WHERE id = NEW.media_owner_id;
    ELSIF NEW.media_type = 'banner' THEN
      UPDATE public.users SET banner_likes = COALESCE(banner_likes, 0) + 1 WHERE id = NEW.media_owner_id;
    END IF;
    RETURN NEW;
  END IF;

  IF tg_op = 'DELETE' THEN
    IF OLD.media_type = 'avatar' THEN
      UPDATE public.users SET avatar_likes = GREATEST(0, COALESCE(avatar_likes, 0) - 1) WHERE id = OLD.media_owner_id;
    ELSIF OLD.media_type = 'banner' THEN
      UPDATE public.users SET banner_likes = GREATEST(0, COALESCE(banner_likes, 0) - 1) WHERE id = OLD.media_owner_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_profile_media_likes_counts ON public.profile_media_likes;

CREATE TRIGGER tr_profile_media_likes_counts
  AFTER INSERT OR DELETE ON public.profile_media_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_media_likes_counts();

ALTER TABLE public.profile_media_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pml_select_own_rows" ON public.profile_media_likes;
CREATE POLICY "pml_select_own_rows"
  ON public.profile_media_likes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pml_insert_self" ON public.profile_media_likes;
CREATE POLICY "pml_insert_self"
  ON public.profile_media_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND media_owner_id <> auth.uid()
  );

DROP POLICY IF EXISTS "pml_delete_self" ON public.profile_media_likes;
CREATE POLICY "pml_delete_self"
  ON public.profile_media_likes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.profile_media_likes FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.profile_media_likes TO authenticated;

-- Vue profil public : exposer les compteurs
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
  'Profils utilisateurs — annuaire sûr (incl. compteurs likes avatar/bannière).';

REVOKE ALL ON public.user_public_profile FROM PUBLIC;
GRANT SELECT ON public.user_public_profile TO authenticated;
GRANT SELECT ON public.user_public_profile TO service_role;

-- RPC invités : même signature étendue (DROP obligatoire si RETURNS TABLE change)
DROP FUNCTION IF EXISTS public.get_public_profile_by_username(text);

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
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

COMMENT ON FUNCTION public.get_public_profile_by_username(text) IS
  'Profil public par username (invité + auth) — incl. avatar_likes / banner_likes.';

COMMIT;
