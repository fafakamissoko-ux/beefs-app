-- ========================================================
-- FIX COMPLET NOTIFICATIONS - A executer apres le diagnostic
-- Ce script est idempotent (peut etre execute plusieurs fois)
-- ========================================================

-- ─── 1. S'assurer que la table notifications existe ───
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('follow', 'invite', 'beef_live', 'gift', 'message', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);

-- ─── 2. RLS ───
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users receive notifications" ON notifications;
CREATE POLICY "Users receive notifications" ON notifications
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- ─── 3. Fix RLS direct_messages pour permettre le mark-as-read ───
DROP POLICY IF EXISTS "Users can update own messages" ON direct_messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON direct_messages;
CREATE POLICY "Users can update messages in their conversations"
  ON direct_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = direct_messages.conversation_id
      AND (auth.uid() = c.participant_1 OR auth.uid() = c.participant_2)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = direct_messages.conversation_id
      AND (auth.uid() = c.participant_1 OR auth.uid() = c.participant_2)
    )
  );

-- ─── 4. Realtime publication (safe: ignore if already added) ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;

-- ─── 5. TOUS LES TRIGGERS DE NOTIFICATION ───

-- 5a. Nouveau DM → notifier le destinataire
CREATE OR REPLACE FUNCTION notify_new_dm()
RETURNS TRIGGER AS $$
DECLARE
  p1 uuid;
  p2 uuid;
  recipient uuid;
  sender_name text;
BEGIN
  SELECT participant_1, participant_2 INTO p1, p2 
  FROM conversations WHERE id = NEW.conversation_id;
  
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO sender_name 
  FROM users WHERE id = NEW.sender_id;

  IF NEW.sender_id = p1 THEN
    recipient := p2;
  ELSE
    recipient := p1;
  END IF;

  IF recipient IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (
      recipient, 
      'message', 
      'Nouveau message', 
      sender_name || ' t''a envoyé un message', 
      '/messages', 
      jsonb_build_object('sender_id', NEW.sender_id, 'conversation_id', NEW.conversation_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_dm ON direct_messages;
CREATE TRIGGER trigger_notify_new_dm
  AFTER INSERT ON direct_messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_dm();

-- 5b. Nouveau follow → notifier la personne suivie
CREATE OR REPLACE FUNCTION notify_new_follow()
RETURNS TRIGGER AS $$
DECLARE
  follower_name text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO follower_name 
  FROM users WHERE id = NEW.follower_id;

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (
    NEW.following_id, 
    'follow', 
    'Nouveau follower', 
    follower_name || ' te suit maintenant', 
    '/profile/' || (SELECT username FROM users WHERE id = NEW.follower_id), 
    jsonb_build_object('follower_id', NEW.follower_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_follow ON followers;
CREATE TRIGGER trigger_notify_new_follow
  AFTER INSERT ON followers
  FOR EACH ROW EXECUTE FUNCTION notify_new_follow();

-- 5c. Invitation beef → notifier l'invité
CREATE OR REPLACE FUNCTION notify_beef_invitation()
RETURNS TRIGGER AS $$
DECLARE
  inviter_name text;
  beef_title text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO inviter_name 
  FROM users WHERE id = NEW.inviter_id;
  SELECT title INTO beef_title FROM beefs WHERE id = NEW.beef_id;

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (
    NEW.invitee_id, 
    'invite', 
    'Invitation à un beef', 
    inviter_name || ' t''invite à "' || COALESCE(beef_title, 'un beef') || '"', 
    '/invitations', 
    jsonb_build_object('beef_id', NEW.beef_id, 'inviter_id', NEW.inviter_id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_beef_invitation ON beef_invitations;
CREATE TRIGGER trigger_notify_beef_invitation
  AFTER INSERT ON beef_invitations
  FOR EACH ROW EXECUTE FUNCTION notify_beef_invitation();

-- 5d. Réponse invitation → notifier l'inviteur
CREATE OR REPLACE FUNCTION notify_invitation_response()
RETURNS TRIGGER AS $$
DECLARE
  invitee_name text;
  beef_title text;
BEGIN
  IF OLD.status IN ('sent', 'seen') AND NEW.status IN ('accepted', 'declined') THEN
    SELECT COALESCE(display_name, username, 'Quelqu''un') INTO invitee_name 
    FROM users WHERE id = NEW.invitee_id;
    SELECT title INTO beef_title FROM beefs WHERE id = NEW.beef_id;

    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (
      NEW.inviter_id,
      'invite',
      CASE WHEN NEW.status = 'accepted' THEN 'Invitation acceptée !' ELSE 'Invitation refusée' END,
      invitee_name || CASE WHEN NEW.status = 'accepted' THEN ' a accepté ton invitation pour "' ELSE ' a refusé ton invitation pour "' END || COALESCE(beef_title, 'un beef') || '"',
      CASE WHEN NEW.status = 'accepted' THEN '/arena/' || NEW.beef_id ELSE '/feed' END,
      jsonb_build_object('invitee_id', NEW.invitee_id, 'beef_id', NEW.beef_id, 'response', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_invitation_response ON beef_invitations;
CREATE TRIGGER trigger_notify_invitation_response
  AFTER UPDATE ON beef_invitations
  FOR EACH ROW EXECUTE FUNCTION notify_invitation_response();

-- 5e. Beef passe en live → notifier participants + followers du médiateur
CREATE OR REPLACE FUNCTION notify_beef_live()
RETURNS TRIGGER AS $$
DECLARE
  p_record RECORD;
  mediator_name text;
BEGIN
  IF OLD.status != 'live' AND NEW.status = 'live' THEN
    SELECT COALESCE(display_name, username, 'Quelqu''un') INTO mediator_name 
    FROM users WHERE id = NEW.mediator_id;

    FOR p_record IN
      SELECT user_id FROM beef_participants WHERE beef_id = NEW.id AND user_id != NEW.mediator_id
    LOOP
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (p_record.user_id, 'beef_live', 'Beef en direct !', '"' || COALESCE(NEW.title, 'Un beef') || '" est en live !', '/arena/' || NEW.id, jsonb_build_object('beef_id', NEW.id));
    END LOOP;

    FOR p_record IN
      SELECT follower_id FROM followers WHERE following_id = NEW.mediator_id
    LOOP
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (p_record.follower_id, 'beef_live', 'Beef en direct !', mediator_name || ' est en live : "' || COALESCE(NEW.title, 'Un beef') || '"', '/arena/' || NEW.id, jsonb_build_object('beef_id', NEW.id))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_beef_live ON beefs;
CREATE TRIGGER trigger_notify_beef_live
  AFTER UPDATE ON beefs
  FOR EACH ROW EXECUTE FUNCTION notify_beef_live();

-- 5f. Gift reçu → notifier le médiateur
CREATE OR REPLACE FUNCTION notify_gift_received()
RETURNS TRIGGER AS $$
DECLARE
  sender_name text;
  beef_title text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO sender_name 
  FROM users WHERE id = NEW.sender_id;
  SELECT title INTO beef_title FROM beefs WHERE id = NEW.beef_id;

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (
    NEW.recipient_id,
    'gift',
    'Cadeau reçu !',
    sender_name || ' t''a envoyé un cadeau (' || NEW.points_amount || ' pts) pendant "' || COALESCE(beef_title, 'un beef') || '"',
    '/arena/' || NEW.beef_id,
    jsonb_build_object('sender_id', NEW.sender_id, 'beef_id', NEW.beef_id, 'points', NEW.points_amount)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_gift ON gifts;
CREATE TRIGGER trigger_notify_gift
  AFTER INSERT ON gifts
  FOR EACH ROW EXECUTE FUNCTION notify_gift_received();

-- ─── 6. TEST: Insérer une notification de test pour vérifier que ça marche ───
-- Remplace 'TON_USER_ID' par ton vrai user ID avant d'exécuter
-- Tu peux trouver ton user_id dans la table users ou dans auth.users

-- INSERT INTO notifications (user_id, type, title, body, link)
-- VALUES ('TON_USER_ID', 'system', 'Test notification', 'Si tu vois ceci, les notifications fonctionnent !', '/notifications');
