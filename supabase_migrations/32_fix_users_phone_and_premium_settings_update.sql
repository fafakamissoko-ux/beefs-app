-- Corrige deux problèmes liés au trigger enforce_users_safe_self_update (migration 31) :
-- 1) Si la table public.users n’a pas la colonne `phone`, l’UPDATE échoue avec :
--    record "new" has no field "phone" (PostgreSQL 42703).
-- 2) La ligne NEW.premium_settings := OLD.premium_settings empêchait tout self-update
--    des préférences premium (dont statsShortcuts / cases à cocher profil).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE OR REPLACE FUNCTION public.enforce_users_safe_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_app_admin() THEN
    RETURN NEW;
  END IF;

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
  -- premium_settings : laissé à NEW (badges affichage, raccourcis stats, etc.)
  NEW.badges := OLD.badges;
  NEW.is_verified := OLD.is_verified;
  NEW.is_banned := OLD.is_banned;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.notification_settings := OLD.notification_settings;
  NEW.privacy_settings := OLD.privacy_settings;
  NEW.role := OLD.role;
  NEW.banned_until := OLD.banned_until;
  NEW.ban_reason := OLD.ban_reason;
  RETURN NEW;
END;
$$;
