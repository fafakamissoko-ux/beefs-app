-- Marquer les notifications lues côté serveur (SECURITY DEFINER) pour garantir la persistance
-- même si les politiques RLS / PostgREST sur UPDATE posent problème.

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = auth.uid()
    AND is_read IS DISTINCT FROM true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO service_role;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE id = p_id
    AND user_id = auth.uid();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO service_role;

COMMENT ON FUNCTION public.mark_all_notifications_read IS 'Marque toutes les notifications du JWT courant comme lues.';
COMMENT ON FUNCTION public.mark_notification_read(uuid) IS 'Marque une notification comme lue (propriétaire uniquement).';

-- Propriétaire postgres : exécution avec droits suffisants (RLS contournée pour l’UPDATE ciblé).
ALTER FUNCTION public.mark_all_notifications_read() OWNER TO postgres;
ALTER FUNCTION public.mark_notification_read(uuid) OWNER TO postgres;
