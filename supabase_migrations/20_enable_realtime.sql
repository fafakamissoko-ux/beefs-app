-- ============================================================
-- Migration 20: Enable Realtime for live tables
-- Required for reactions, messages, and tension to sync
-- ============================================================

-- Enable REPLICA IDENTITY FULL for realtime to work with filters
ALTER TABLE beef_messages REPLICA IDENTITY FULL;
ALTER TABLE beef_reactions REPLICA IDENTITY FULL;
ALTER TABLE beefs REPLICA IDENTITY FULL;
ALTER TABLE beef_invitations REPLICA IDENTITY FULL;

-- Add tables to realtime publication
-- (If publication doesn't exist yet, Supabase creates it automatically)
DO $$
BEGIN
  -- Try adding to existing publication
  ALTER PUBLICATION supabase_realtime ADD TABLE beef_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE beef_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE beefs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE beef_invitations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
