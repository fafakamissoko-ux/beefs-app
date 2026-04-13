-- Phase 7 — Fermer le SELECT direct sur public.users pour le rôle anon.
-- Les flux login / signup / profil public invité passent par des RPC SECURITY DEFINER
-- (contrôle fin des données renvoyées, pas d’énumération large via PostgREST).
-- Les utilisateurs authentifiés conservent le SELECT sur users (phase ultérieure : vue « profil public »).

-- ─── RPC : pseudo disponible (signup, sans session) ───
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE lower(u.username) = lower(trim(p_username))
  );
$$;

REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO authenticated;

-- ─── RPC : pré-contrôle login (pseudo → email + statut ban, ou email direct) ───
CREATE OR REPLACE FUNCTION public.login_precheck(p_identifier text)
RETURNS TABLE (
  found boolean,
  email text,
  is_banned boolean,
  banned_until timestamptz,
  ban_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trim text := trim(p_identifier);
  v_resolved_email text;
  v_row public.users%ROWTYPE;
BEGIN
  IF v_trim IS NULL OR v_trim = '' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  IF position('@' in v_trim) > 0 THEN
    v_resolved_email := v_trim;
  ELSE
    SELECT u.email INTO v_resolved_email
    FROM public.users u
    WHERE lower(u.username) = lower(v_trim)
    LIMIT 1;
  END IF;

  IF v_resolved_email IS NULL OR v_resolved_email = '' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.users u
  WHERE lower(u.email) = lower(v_resolved_email)
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    v_row.email,
    COALESCE(v_row.is_banned, false),
    v_row.banned_until,
    v_row.ban_reason;
END;
$$;

REVOKE ALL ON FUNCTION public.login_precheck(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_precheck(text) TO anon;
GRANT EXECUTE ON FUNCTION public.login_precheck(text) TO authenticated;

-- ─── RPC : profil « public » pour visiteurs non connectés (sans email / phone / Stripe) ───
CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  points integer,
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
    u.username,
    u.display_name,
    u.bio,
    u.avatar_url,
    u.points,
    COALESCE(u.is_premium, false),
    u.created_at,
    (u.premium_settings -> 'statsShortcuts') AS stats_shortcuts
  FROM public.users u
  WHERE lower(u.username) = lower(trim(p_username))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO authenticated;

-- ─── RLS users : plus de lecture pour anon ───
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;

CREATE POLICY "users_select_authenticated"
  ON public.users
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Les admins : politique existante « Admins manage all users » (31) couvre déjà ALL pour le rôle authenticated admin.
