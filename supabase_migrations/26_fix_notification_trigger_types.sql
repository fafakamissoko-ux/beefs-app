-- Fix notification trigger type values to match CHECK constraint
-- Table constraint: type IN ('follow', 'invite', 'beef_live', 'gift', 'message', 'system')
-- Previous triggers used 'invitation' and 'live' which silently fail

-- Fix beef invitation notification trigger
CREATE OR REPLACE FUNCTION notify_beef_invitation()
RETURNS TRIGGER AS $$
DECLARE
  inviter_name text;
  beef_title text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO inviter_name FROM users WHERE id = NEW.inviter_id;
  SELECT title INTO beef_title FROM beefs WHERE id = NEW.beef_id;

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (NEW.invitee_id, 'invite', 'Invitation à un beef', inviter_name || ' t''invite à "' || COALESCE(beef_title, 'un beef') || '"', '/invitations', jsonb_build_object('beef_id', NEW.beef_id, 'inviter_id', NEW.inviter_id));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add gift notification trigger
CREATE OR REPLACE FUNCTION notify_gift_received()
RETURNS TRIGGER AS $$
DECLARE
  sender_name text;
  beef_title text;
BEGIN
  SELECT COALESCE(display_name, username, 'Quelqu''un') INTO sender_name FROM users WHERE id = NEW.sender_id;
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

-- Notify inviter when invitation is accepted/declined
CREATE OR REPLACE FUNCTION notify_invitation_response()
RETURNS TRIGGER AS $$
DECLARE
  invitee_name text;
  beef_title text;
BEGIN
  IF OLD.status IN ('sent', 'seen') AND NEW.status IN ('accepted', 'declined') THEN
    SELECT COALESCE(display_name, username, 'Quelqu''un') INTO invitee_name FROM users WHERE id = NEW.invitee_id;
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

-- Fix beef live notification trigger
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
