-- Realtime sur beef_participants : file d’invitations à jour sans recharger le deck
ALTER TABLE beef_participants REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE beef_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
