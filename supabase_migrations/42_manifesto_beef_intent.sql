-- Manifestes : mediator_id nullable, intent, event_type, created_by (RLS).
-- Médiation inchangée côté données : mediator_id = créateur, created_by = créateur.

ALTER TABLE public.beefs
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.beefs
  ADD COLUMN IF NOT EXISTS intent TEXT NOT NULL DEFAULT 'mediation'
  CHECK (intent IN ('manifesto', 'mediation'));

ALTER TABLE public.beefs
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'standard'
  CHECK (event_type IN ('standard', 'prestige'));

UPDATE public.beefs SET created_by = mediator_id WHERE created_by IS NULL;

ALTER TABLE public.beefs ALTER COLUMN mediator_id DROP NOT NULL;

COMMENT ON COLUMN public.beefs.created_by IS 'Créateur de la ligne (manifeste ou médiation).';
COMMENT ON COLUMN public.beefs.intent IS 'manifesto = manifeste (pas de médiateur au départ), mediation = médiateur = créateur.';
COMMENT ON COLUMN public.beefs.event_type IS 'standard | prestige (affichage / futur palier premium).';

-- ─── RLS beefs : insert / update / delete ───
DROP POLICY IF EXISTS "Authenticated users can create beefs" ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_authenticated" ON public.beefs;

CREATE POLICY "beefs_insert_intent"
  ON public.beefs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = created_by
    AND (
      (intent = 'mediation' AND mediator_id = auth.uid())
      OR (intent = 'manifesto' AND mediator_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Mediators can update their beefs" ON public.beefs;

CREATE POLICY "beefs_update_mediator_or_creator"
  ON public.beefs
  FOR UPDATE
  USING (
    auth.uid() = mediator_id
    OR auth.uid() = created_by
  );

DROP POLICY IF EXISTS "Mediators can delete their beefs" ON public.beefs;

CREATE POLICY "beefs_delete_mediator_or_creator"
  ON public.beefs
  FOR DELETE
  USING (
    auth.uid() = mediator_id
    OR auth.uid() = created_by
  );

-- ─── beef_participants ───
DROP POLICY IF EXISTS "Mediators can add participants" ON public.beef_participants;

CREATE POLICY "beef_participants_insert_mediator_or_manifest_author"
  ON public.beef_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_id
      AND (
        b.mediator_id = auth.uid()
        OR (b.mediator_id IS NULL AND b.created_by = auth.uid() AND b.intent = 'manifesto')
      )
    )
  );

DROP POLICY IF EXISTS "Mediators can update participants" ON public.beef_participants;

CREATE POLICY "beef_participants_update_mediator_or_manifest_author"
  ON public.beef_participants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_id
      AND (
        b.mediator_id = auth.uid()
        OR (b.mediator_id IS NULL AND b.created_by = auth.uid())
      )
    )
  );

-- ─── beef_invitations ───
DROP POLICY IF EXISTS "Mediators can send invitations" ON public.beef_invitations;

CREATE POLICY "beef_invitations_insert_mediator_or_author"
  ON public.beef_invitations
  FOR INSERT
  WITH CHECK (
    auth.uid() = inviter_id
    AND EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_id
      AND (
        b.mediator_id = auth.uid()
        OR (b.mediator_id IS NULL AND b.created_by = auth.uid())
      )
    )
  );

-- ─── RPC résumé terminal : médiateur optionnel ───
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
  LEFT JOIN public.users u ON u.id = b.mediator_id
  WHERE b.id = p_beef_id
    AND b.status IN ('ended', 'replay', 'cancelled')
  LIMIT 1;
$$;

-- ─── Notification beef live : présentateur = médiateur ou auteur manifeste ───
CREATE OR REPLACE FUNCTION public.notify_beef_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_record RECORD;
  mediator_name text;
  v_presenter uuid;
BEGIN
  v_presenter := COALESCE(NEW.mediator_id, NEW.created_by);

  IF OLD.status IS DISTINCT FROM 'live' AND NEW.status = 'live' THEN
    IF v_presenter IS NOT NULL THEN
      SELECT COALESCE(display_name, username, 'Quelqu''un') INTO mediator_name
      FROM users WHERE id = v_presenter;
    ELSE
      mediator_name := 'Quelqu''un';
    END IF;

    FOR p_record IN
      SELECT user_id FROM beef_participants
      WHERE beef_id = NEW.id AND user_id IS DISTINCT FROM v_presenter
    LOOP
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (
        p_record.user_id,
        'beef_live',
        'Beef en direct !',
        '"' || COALESCE(NEW.title, 'Un beef') || '" est en live !',
        '/arena/' || NEW.id,
        jsonb_build_object('beef_id', NEW.id)
      );
    END LOOP;

    IF v_presenter IS NOT NULL THEN
      FOR p_record IN
        SELECT follower_id FROM followers WHERE following_id = v_presenter
      LOOP
        INSERT INTO notifications (user_id, type, title, body, link, metadata)
        VALUES (
          p_record.follower_id,
          'beef_live',
          'Beef en direct !',
          COALESCE(mediator_name, 'Quelqu''un') || ' est en live : "' || COALESCE(NEW.title, 'Un beef') || '"',
          '/arena/' || NEW.id,
          jsonb_build_object('beef_id', NEW.id)
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
