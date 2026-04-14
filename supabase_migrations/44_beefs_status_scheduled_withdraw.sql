-- Statuts beefs étendus (scheduled, replay) + désistement médiateur manifeste.

ALTER TABLE public.beefs DROP CONSTRAINT IF EXISTS beefs_status_check;

ALTER TABLE public.beefs
  ADD CONSTRAINT beefs_status_check CHECK (
    status IN (
      'pending',
      'ready',
      'live',
      'ended',
      'cancelled',
      'scheduled',
      'replay'
    )
  );

-- Le médiateur peut se désister : repasse en manifeste orphelin (pending, sans médiateur).
DROP POLICY IF EXISTS "beefs_manifesto_mediator_withdraw" ON public.beefs;

CREATE POLICY "beefs_manifesto_mediator_withdraw"
  ON public.beefs
  FOR UPDATE
  USING (
    intent = 'manifesto'
    AND mediator_id = auth.uid()
  )
  WITH CHECK (
    intent = 'manifesto'
    AND mediator_id IS NULL
    AND status = 'pending'
  );
