-- Édition beef (pending) : retrait de challengers / invitations côté créateur.
BEGIN;

GRANT DELETE ON public.beef_invitations TO authenticated;

DROP POLICY IF EXISTS "bi_delete_inviter_on_beef" ON public.beef_invitations;
DROP POLICY IF EXISTS "bp_delete_creator_pending_beef" ON public.beef_participants;

CREATE POLICY "bi_delete_inviter_on_beef"
  ON public.beef_invitations FOR DELETE TO authenticated
  USING (
    auth.uid() = inviter_id
    AND EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_invitations.beef_id
        AND (b.created_by = auth.uid() OR b.mediator_id = auth.uid())
    )
  );

CREATE POLICY "bp_delete_creator_pending_beef"
  ON public.beef_participants FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND b.created_by = auth.uid()
        AND b.status = 'pending'
    )
  );

COMMIT;
