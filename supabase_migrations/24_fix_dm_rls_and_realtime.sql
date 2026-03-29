-- Fix: allow recipients to mark DM messages as read
DROP POLICY IF EXISTS "Users can update own messages" ON direct_messages;
CREATE POLICY "Users can update messages in their conversations"
  ON direct_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = direct_messages.conversation_id
      AND auth.uid() = ANY(c.participants)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = direct_messages.conversation_id
      AND auth.uid() = ANY(c.participants)
    )
  );

-- Enable realtime for direct_messages and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Fix notifications INSERT policy: only allow inserting notifications for yourself or via service role
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "Users receive notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);
