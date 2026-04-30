-- Radar réactif : sparks d'Aura lifetime, prestige mis à jour (follow +/-10),
-- vue fusionnable avec notifications, RPC transmit / revoke sécurisés.

-- ─── users.lifetime_points (prestige cumulatif) ───
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lifetime_points integer NOT NULL DEFAULT 0;

-- ─── Recréer la vue profil public (ajout lifetime_points) ───
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
  u.privacy_settings
FROM public.users u;

ALTER VIEW public.user_public_profile OWNER TO postgres;
COMMENT ON VIEW public.user_public_profile IS
  'Profils utilisateurs — colonnes sûres pour annuaire (incl. lifetime_points prestige).';

REVOKE ALL ON public.user_public_profile FROM PUBLIC;
GRANT SELECT ON public.user_public_profile TO authenticated;
GRANT SELECT ON public.user_public_profile TO service_role;

-- ─── Étincelles Aura (profil ou teaser futur) ───
-- IMPORTANT : si `aura_sparks` existait déjà (run partiel), `CREATE TABLE IF NOT EXISTS`
-- la laisse intacte sans nouvelles colonnes. On aligne ensuite le schéma avec ALTER TABLE.
CREATE TABLE IF NOT EXISTS public.aura_sparks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giver_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_sparks_no_self CHECK (giver_id <> entity_id)
);

ALTER TABLE public.aura_sparks
  ADD COLUMN IF NOT EXISTS source_kind text DEFAULT 'profile';

UPDATE public.aura_sparks SET source_kind = 'profile' WHERE source_kind IS NULL;

ALTER TABLE public.aura_sparks
  ALTER COLUMN source_kind SET DEFAULT 'profile',
  ALTER COLUMN source_kind SET NOT NULL;

ALTER TABLE public.aura_sparks DROP CONSTRAINT IF EXISTS aura_sparks_source_kind_check;

ALTER TABLE public.aura_sparks
  ADD CONSTRAINT aura_sparks_source_kind_check CHECK (source_kind IN ('profile', 'teaser'));

DROP INDEX IF EXISTS public.ux_aura_profile_one_pair;

CREATE UNIQUE INDEX ux_aura_profile_one_pair
  ON public.aura_sparks (giver_id, entity_id)
  WHERE source_kind = 'profile';

CREATE INDEX IF NOT EXISTS idx_aura_sparks_entity_id ON public.aura_sparks (entity_id);
CREATE INDEX IF NOT EXISTS idx_aura_sparks_giver_id ON public.aura_sparks (giver_id);

ALTER TABLE public.aura_sparks OWNER TO postgres;
ALTER TABLE public.aura_sparks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_sparks_select_parties" ON public.aura_sparks;
CREATE POLICY "aura_sparks_select_parties"
  ON public.aura_sparks
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND (giver_id = auth.uid() OR entity_id = auth.uid()));

REVOKE ALL ON public.aura_sparks FROM PUBLIC;
GRANT SELECT ON public.aura_sparks TO authenticated;

-- ─── Radar : lignes lisibles comme les notifications ───
DROP VIEW IF EXISTS public.aura_notifications;

CREATE VIEW public.aura_notifications
WITH (security_invoker = true) AS
SELECT
  ('spark-' || s.id::text)::text AS id,
  s.entity_id AS user_id,
  s.created_at,
  COALESCE(gu.display_name, gu.username, 'Quelqu''un'::text)::text AS giver_name,
  gu.username::text AS giver_username,
  s.source_kind::text AS aura_kind
FROM public.aura_sparks s
INNER JOIN public.users gu ON gu.id = s.giver_id;

ALTER VIEW public.aura_notifications OWNER TO postgres;
COMMENT ON VIEW public.aura_notifications IS
  'Alertes Radar : validations d’Aura reçues (entity_id = destinataire).';

REVOKE ALL ON public.aura_notifications FROM PUBLIC;
GRANT SELECT ON public.aura_notifications TO authenticated;

-- ─── transmit_aura : +1 lifetime sur le profil destinataire (idempotent profile) ───
CREATE OR REPLACE FUNCTION public.transmit_aura(p_entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_entity_id IS NULL OR v_uid = p_entity_id THEN
    RAISE EXCEPTION 'invalid entity';
  END IF;

  BEGIN
    INSERT INTO public.aura_sparks (giver_id, entity_id, source_kind)
    VALUES (v_uid, p_entity_id, 'profile');

    UPDATE public.users
    SET lifetime_points = COALESCE(lifetime_points, 0) + 1
    WHERE id = p_entity_id;

    RETURN true;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN false;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.transmit_aura(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transmit_aura(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transmit_aura(uuid) TO service_role;

COMMENT ON FUNCTION public.transmit_aura(uuid) IS
  'Étincelle profil (+1 prestige) ou false si cette paire était déjà en base.';

-- ─── revoke_profile_aura : retrait sparkle profil −1 prestige ───
CREATE OR REPLACE FUNCTION public.revoke_profile_aura(p_entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_entity_id IS NULL OR v_uid = p_entity_id THEN
    RAISE EXCEPTION 'invalid entity';
  END IF;

  DELETE FROM public.aura_sparks
  WHERE giver_id = v_uid
    AND entity_id = p_entity_id
    AND source_kind = 'profile';

  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n > 0 THEN
    UPDATE public.users
    SET lifetime_points = GREATEST(0, COALESCE(lifetime_points, 0) - 1)
    WHERE id = p_entity_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_profile_aura(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_profile_aura(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_profile_aura(uuid) TO service_role;

COMMENT ON FUNCTION public.revoke_profile_aura(uuid) IS
  'Supprime la transmission profil de l’’utilisateur courant et −1 prestige sur le destinataire ; retourne false si aucune ligne.';

-- ─── Nouveaux suivis / unfollow → +10 / −10 Aura lifetime du destinataire ───
CREATE OR REPLACE FUNCTION public.follow_adjust_recipient_lifetime()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.users
    SET lifetime_points = COALESCE(lifetime_points, 0) + 10
    WHERE id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.users
    SET lifetime_points = GREATEST(0, COALESCE(lifetime_points, 0) - 10)
    WHERE id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_followers_adjust_recipient_lifetime ON public.followers;
CREATE TRIGGER tr_followers_adjust_recipient_lifetime
  AFTER INSERT OR DELETE ON public.followers
  FOR EACH ROW
  EXECUTE FUNCTION public.follow_adjust_recipient_lifetime();

COMMENT ON FUNCTION public.follow_adjust_recipient_lifetime IS
  '+10 / −10 lifetime_points pour le utilisateur suivis (following_id).';

-- ─── Profil public invité : bannière + prestige ───
-- Le type de retour (RETURNS TABLE) ne peut pas changer avec CREATE OR REPLACE ; il faut supprimer d’abord.
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
  stats_shortcuts jsonb
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
    (u.premium_settings -> 'statsShortcuts') AS stats_shortcuts
  FROM public.users u
  WHERE lower(u.username::text) = lower(trim(p_username))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO authenticated;

-- ─── Realtime (Radar / lightbox vivants) ───
ALTER TABLE public.aura_sparks REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_sparks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
