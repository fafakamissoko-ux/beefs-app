-- Phase 7b — Durcir l’accès anon : emails bannis, followers, avis médiation, chat live.
-- Prérequis : migration 31 (is_app_admin), migration 36 (RPC login/users).

-- ─── RPC : inscription — email dans la liste bannie (sans SELECT ouvert sur banned_emails) ───
CREATE OR REPLACE FUNCTION public.is_email_banned(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.banned_emails e
    WHERE lower(e.email) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_banned(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_banned(text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_email_banned(text) TO authenticated;

-- ─── RPC : profil public invité — compteurs abonnés / abonnements ───
CREATE OR REPLACE FUNCTION public.get_public_follow_counts(p_user_id uuid)
RETURNS TABLE (followers_count bigint, following_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::bigint FROM public.followers f WHERE f.following_id = p_user_id),
    (SELECT count(*)::bigint FROM public.followers f WHERE f.follower_id = p_user_id);
$$;

REVOKE ALL ON FUNCTION public.get_public_follow_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_follow_counts(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_follow_counts(uuid) TO authenticated;

-- ─── banned_emails : fin du SELECT public ; gestion réservée aux admins ───
DROP POLICY IF EXISTS "Anyone can check if email is banned" ON public.banned_emails;

CREATE POLICY "Admins manage banned_emails"
  ON public.banned_emails
  FOR ALL
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- ─── followers : plus de liste publique (RPC ci-dessus pour les seuls agrégats invités) ───
DROP POLICY IF EXISTS "Public followers viewable" ON public.followers;

CREATE POLICY "followers_select_authenticated"
  ON public.followers
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─── mediator_viewer_reviews : lecture comptes connectés ───
DROP POLICY IF EXISTS "mvr_select_public" ON public.mediator_viewer_reviews;

CREATE POLICY "mvr_select_authenticated"
  ON public.mediator_viewer_reviews
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─── Chat live : lecture réservée aux comptes connectés ───
DROP POLICY IF EXISTS "Anyone can read messages" ON public.beef_messages;

CREATE POLICY "beef_messages_select_authenticated"
  ON public.beef_messages
  FOR SELECT
  USING (auth.role() = 'authenticated' AND NOT COALESCE(is_deleted, false));

-- Réactions / timeouts : cohérence avec l’arène (session requise)
DROP POLICY IF EXISTS "Anyone can view reactions" ON public.beef_reactions;

CREATE POLICY "beef_reactions_select_authenticated"
  ON public.beef_reactions
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anyone can view timeouts" ON public.user_timeouts;

CREATE POLICY "user_timeouts_select_authenticated"
  ON public.user_timeouts
  FOR SELECT
  USING (auth.role() = 'authenticated');
