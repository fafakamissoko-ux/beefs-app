-- ========================================================
-- DIAGNOSTIC ET FIX COMPLET DES NOTIFICATIONS
-- Execute ce script dans l'editeur SQL de Supabase (prod)
-- ========================================================

-- STEP 1: Verifier que la table notifications existe
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'notifications'
) AS notifications_table_exists;

-- STEP 2: Verifier les triggers existants
SELECT trigger_name, event_manipulation, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name LIKE 'trigger_notify%'
ORDER BY trigger_name;

-- STEP 3: Verifier les fonctions trigger
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'notify_%';

-- STEP 4: Verifier le contenu actuel de la table notifications
SELECT id, created_at, user_id, type, title, body, is_read 
FROM notifications 
ORDER BY created_at DESC 
LIMIT 10;

-- STEP 5: Verifier si la publication realtime inclut les tables
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
AND tablename IN ('notifications', 'direct_messages', 'conversations', 'beef_invitations');

-- STEP 6: Verifier les politiques RLS sur notifications
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'notifications';
