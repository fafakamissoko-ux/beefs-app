-- Assouplir la limite d’envoi du chat live (évite des 403 RLS en rafale tout en gardant une protection anti-spam)
DROP POLICY IF EXISTS "Users can send messages" ON beef_messages;

CREATE POLICY "Users can send messages"
  ON beef_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT is_user_timed_out(beef_id, user_id)
    AND get_recent_message_count(user_id, beef_id, 10) < 15
  );
