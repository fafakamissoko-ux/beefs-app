-- Permet à un utilisateur (non créateur) de devenir médiateur sur un manifeste sans médiateur.
CREATE POLICY "beefs_claim_orphan_manifesto"
  ON public.beefs
  FOR UPDATE
  USING (
    intent = 'manifesto'
    AND mediator_id IS NULL
    AND created_by IS NOT NULL
    AND created_by <> auth.uid()
  )
  WITH CHECK (
    mediator_id = auth.uid()
    AND intent = 'manifesto'
  );
