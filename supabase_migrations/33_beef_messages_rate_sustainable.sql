-- Chat live : conserver RLS (auth.uid = user_id, timeout) et un plafond anti-abus plus réaliste
-- pour éviter les 403 en conversation rapide (fenêtre 60 s, max 80 messages / utilisateur / beef).
DROP POLICY IF EXISTS "Users can send messages" ON beef_messages;

CREATE POLICY "Users can send messages"
  ON beef_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT is_user_timed_out(beef_id, user_id)
    AND get_recent_message_count(user_id, beef_id, 60) < 80
  );
