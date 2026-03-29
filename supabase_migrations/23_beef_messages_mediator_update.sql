-- Allow beef mediator to soft-delete / update any chat message in their beef (RLS ORs with existing policies)
CREATE POLICY "Mediators can moderate beef messages"
  ON beef_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM beefs
      WHERE beefs.id = beef_messages.beef_id
        AND beefs.mediator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM beefs
      WHERE beefs.id = beef_messages.beef_id
        AND beefs.mediator_id = auth.uid()
    )
  );
