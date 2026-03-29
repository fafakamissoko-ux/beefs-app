-- Auto-create notification when a user receives a new DM
CREATE OR REPLACE FUNCTION notify_new_dm()
RETURNS TRIGGER AS $$
DECLARE
  conv_participants uuid[];
  sender_name text;
  p uuid;
BEGIN
  SELECT participants INTO conv_participants FROM conversations WHERE id = NEW.conversation_id;
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO sender_name FROM users WHERE id = NEW.sender_id;

  FOREACH p IN ARRAY conv_participants LOOP
    IF p != NEW.sender_id THEN
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (p, 'message', 'Nouveau message', sender_name || ' t''a envoyé un message', '/messages', jsonb_build_object('sender_id', NEW.sender_id, 'conversation_id', NEW.conversation_id));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_dm ON direct_messages;
CREATE TRIGGER trigger_notify_new_dm
  AFTER INSERT ON direct_messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_dm();

-- Auto-create notification when someone follows a user
CREATE OR REPLACE FUNCTION notify_new_follow()
RETURNS TRIGGER AS $$
DECLARE
  follower_name text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO follower_name FROM users WHERE id = NEW.follower_id;

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (NEW.following_id, 'follow', 'Nouveau follower', follower_name || ' te suit maintenant', '/profile/' || (SELECT username FROM users WHERE id = NEW.follower_id), jsonb_build_object('follower_id', NEW.follower_id));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_follow ON followers;
CREATE TRIGGER trigger_notify_new_follow
  AFTER INSERT ON followers
  FOR EACH ROW EXECUTE FUNCTION notify_new_follow();

-- Auto-create notification when someone receives a beef invitation
CREATE OR REPLACE FUNCTION notify_beef_invitation()
RETURNS TRIGGER AS $$
DECLARE
  inviter_name text;
  beef_title text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO inviter_name FROM users WHERE id = NEW.inviter_id;
  SELECT title INTO beef_title FROM beefs WHERE id = NEW.beef_id;

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (NEW.invitee_id, 'invitation', 'Invitation à un beef', inviter_name || ' t''invite à "' || COALESCE(beef_title, 'un beef') || '"', '/invitations', jsonb_build_object('beef_id', NEW.beef_id, 'inviter_id', NEW.inviter_id));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_beef_invitation ON beef_invitations;
CREATE TRIGGER trigger_notify_beef_invitation
  AFTER INSERT ON beef_invitations
  FOR EACH ROW EXECUTE FUNCTION notify_beef_invitation();

-- Auto-create notification when a beef goes live
CREATE OR REPLACE FUNCTION notify_beef_live()
RETURNS TRIGGER AS $$
DECLARE
  p_record RECORD;
  mediator_name text;
BEGIN
  IF OLD.status != 'live' AND NEW.status = 'live' THEN
    SELECT COALESCE(display_name, username, 'Quelqu''un') INTO mediator_name FROM users WHERE id = NEW.mediator_id;

    FOR p_record IN
      SELECT user_id FROM beef_participants WHERE beef_id = NEW.id AND user_id != NEW.mediator_id
    LOOP
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (p_record.user_id, 'live', 'Beef en direct !', '"' || COALESCE(NEW.title, 'Un beef') || '" est en live !', '/arena/' || NEW.id, jsonb_build_object('beef_id', NEW.id));
    END LOOP;

    -- Also notify followers of the mediator
    FOR p_record IN
      SELECT follower_id FROM followers WHERE following_id = NEW.mediator_id
    LOOP
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (p_record.follower_id, 'live', 'Beef en direct !', mediator_name || ' est en live : "' || COALESCE(NEW.title, 'Un beef') || '"', '/arena/' || NEW.id, jsonb_build_object('beef_id', NEW.id))
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
