-- Phase 6 — RLS : moindre privilège sur users, beef_access, notifications
-- À appliquer après les migrations existantes.
-- Les triggers SECURITY DEFINER (notifications, etc.) contournent toujours le RLS côté propriétaire.

-- ─── Helper : admin sans récursion RLS sur users ───
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO service_role;

-- ─── users : insertion limitée (pas de compte pré-rempli en points / premium) ───
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(points, 0) = 0
    AND COALESCE(xp, 0) = 0
    AND COALESCE(is_premium, false) = false
    AND COALESCE(is_verified, false) = false
  );

-- ─── users : mise à jour — pas de OLD/NEW dans les politiques RLS sur toutes les versions PG ;
--     on fige les colonnes « serveur » via un trigger BEFORE UPDATE (s’exécute avant update_updated_at).
CREATE OR REPLACE FUNCTION public.enforce_users_safe_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / jobs sans JWT : ne pas toucher à la ligne
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_app_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Mise à jour de profil réservée au compte connecté';
  END IF;

  -- Self-service : seules ces colonnes peuvent changer (le reste reprend OLD)
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
  NEW.premium_settings := OLD.premium_settings;
  NEW.badges := OLD.badges;
  NEW.is_verified := OLD.is_verified;
  NEW.is_banned := OLD.is_banned;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.notification_settings := OLD.notification_settings;
  NEW.privacy_settings := OLD.privacy_settings;
  NEW.role := OLD.role;
  NEW.banned_until := OLD.banned_until;
  NEW.ban_reason := OLD.ban_reason;
  -- display_name, bio, avatar_url, banner_url, accent_color, display_preferences : laissées à NEW
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_users_safe_self_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_users_safe_self_update ON public.users;
CREATE TRIGGER enforce_users_safe_self_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_users_safe_self_update();

-- ─── users : politique UPDATE (sans OLD — compatible tous PG)
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users update own profile safe columns" ON public.users;

CREATE POLICY "Users update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins manage all users"
  ON public.users FOR ALL
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- ─── beef_access : seul le service role (API serveur) doit pouvoir insérer ───
DROP POLICY IF EXISTS "System can grant beef access" ON public.beef_access;

-- ─── notifications : fin du INSERT ouvert (spam) ; triggers DEFINER inchangés ───
DROP POLICY IF EXISTS "Users receive notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "Users insert own notifications only"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);
