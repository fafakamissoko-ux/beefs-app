-- Compteurs badges : RPC stables (auth.uid()) pour éviter les filtres PostgREST ambigus
-- et aligner la définition « non lu » sur is_read IS DISTINCT FROM true.

CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND is_read IS DISTINCT FROM true;
$$;

REVOKE ALL ON FUNCTION public.count_unread_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.count_unread_direct_messages()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.direct_messages dm
  INNER JOIN public.conversations c ON c.id = dm.conversation_id
  WHERE (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    AND dm.sender_id <> auth.uid()
    AND dm.is_deleted IS NOT TRUE
    AND dm.is_read IS DISTINCT FROM true;
$$;

REVOKE ALL ON FUNCTION public.count_unread_direct_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_direct_messages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_unread_direct_messages() TO service_role;

COMMENT ON FUNCTION public.count_unread_notifications IS 'Badge header : nombre de notifications non lues pour le JWT courant.';
COMMENT ON FUNCTION public.count_unread_direct_messages IS 'Badge header : DMs non lus reçus dans les conversations du JWT courant.';
