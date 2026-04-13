-- Phase 7c — beefs / beef_participants : plus de SELECT pour le rôle anon.
-- Profil public invité et résumé beef terminal : RPC SECURITY DEFINER à données limitées.

-- ─── RPC : bundle profil (invité) — listes + compteurs ───
CREATE OR REPLACE FUNCTION public.get_public_profile_beefs_payload(p_profile_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hosted jsonb;
  v_part jsonb;
  v_hc bigint;
  v_pc bigint;
BEGIN
  SELECT count(*) INTO v_hc FROM public.beefs WHERE mediator_id = p_profile_user_id;
  SELECT count(DISTINCT beef_id) INTO v_pc FROM public.beef_participants WHERE user_id = p_profile_user_id;

  SELECT coalesce(
    (
      SELECT jsonb_agg(to_jsonb(t))
      FROM (
        SELECT
          b.id,
          b.title,
          b.description,
          b.status,
          b.resolution_status,
          b.mediation_summary,
          b.tags,
          b.scheduled_at,
          b.created_at,
          b.is_premium,
          b.price,
          b.viewer_count,
          b.mediator_id
        FROM public.beefs b
        WHERE b.mediator_id = p_profile_user_id
        ORDER BY b.created_at DESC
        LIMIT 10
      ) t
    ),
    '[]'::jsonb
  )
  INTO v_hosted;

  SELECT coalesce(
    (
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT
          d.id,
          d.title,
          d.description,
          d.status,
          d.resolution_status,
          d.mediation_summary,
          d.tags,
          d.scheduled_at,
          d.created_at,
          d.is_premium,
          d.price,
          d.viewer_count,
          d.mediator_id,
          d.mediator_username,
          d.mediator_display_name
        FROM (
          SELECT DISTINCT ON (b.id)
            b.id,
            b.title,
            b.description,
            b.status,
            b.resolution_status,
            b.mediation_summary,
            b.tags,
            b.scheduled_at,
            b.created_at,
            b.is_premium,
            b.price,
            b.viewer_count,
            b.mediator_id,
            mu.username AS mediator_username,
            mu.display_name AS mediator_display_name
          FROM public.beef_participants p
          INNER JOIN public.beefs b ON b.id = p.beef_id
          LEFT JOIN public.users mu ON mu.id = b.mediator_id
          WHERE p.user_id = p_profile_user_id
          ORDER BY b.id, b.created_at DESC
        ) d
        ORDER BY d.created_at DESC
        LIMIT 24
      ) x
    ),
    '[]'::jsonb
  )
  INTO v_part;

  RETURN jsonb_build_object(
    'hosted_count', v_hc,
    'participated_count', v_pc,
    'hosted', v_hosted,
    'participated', v_part
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_beefs_payload(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_beefs_payload(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_beefs_payload(uuid) TO authenticated;

-- ─── RPC : page résumé beef (statuts terminaux uniquement, invité OK) ───
CREATE OR REPLACE FUNCTION public.get_public_terminal_beef_summary(p_beef_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'title', b.title,
    'subject', b.subject,
    'description', b.description,
    'status', b.status,
    'created_at', b.created_at,
    'started_at', b.started_at,
    'ended_at', b.ended_at,
    'viewer_count', b.viewer_count,
    'tags', b.tags,
    'mediator_id', b.mediator_id,
    'mediator_username', u.username,
    'mediator_display_name', u.display_name
  )
  FROM public.beefs b
  INNER JOIN public.users u ON u.id = b.mediator_id
  WHERE b.id = p_beef_id
    AND b.status IN ('ended', 'replay', 'cancelled')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_terminal_beef_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_terminal_beef_summary(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_terminal_beef_summary(uuid) TO authenticated;

-- ─── RLS beefs / beef_participants ───
DROP POLICY IF EXISTS "Public beefs are viewable by everyone" ON public.beefs;

CREATE POLICY "beefs_select_authenticated"
  ON public.beefs
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public participants viewable" ON public.beef_participants;

CREATE POLICY "beef_participants_select_authenticated"
  ON public.beef_participants
  FOR SELECT
  USING (auth.role() = 'authenticated');
