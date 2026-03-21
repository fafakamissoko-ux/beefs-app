-- =====================================================
-- CRÉER UN BEEF DE TEST SIMPLE (1 PARTICIPANT)
-- =====================================================

-- 🔹 ÉTAPE 1: Trouve ton user_id
-- Copie-colle dans Supabase SQL Editor et exécute:

SELECT id, email, username 
FROM users 
ORDER BY created_at DESC 
LIMIT 5;

-- Note ton user_id (ex: 39bc1447-a63d-4021-8000-610414aadea7)

-- =====================================================
-- 🔹 ÉTAPE 2: Crée un beef de test
-- REMPLACE 'TON_USER_ID' par l'ID de l'étape 1
-- =====================================================

INSERT INTO beefs (
  title,
  subject,
  mediator_id,
  status,
  price,
  tags,
  scheduled_date,
  created_at,
  updated_at
) VALUES (
  '🔥 Beef de Test - Chat Fonctionnel',
  'Test de la messagerie instantanée',
  'TON_USER_ID',  -- ⚠️ REMPLACE ICI
  'live',
  0,
  ARRAY['test', 'chat', 'demo'],
  NULL,
  NOW(),
  NOW()
) RETURNING id, title;

-- =====================================================
-- 🔹 ÉTAPE 3: Copie l'ID retourné
-- =====================================================
-- L'ID sera affiché (ex: a1b2c3d4-e5f6-7890-abcd-ef1234567890)

-- =====================================================
-- 🔹 ÉTAPE 4: Va sur cette URL
-- =====================================================
-- http://localhost:3000/arena/[COLLE_ICI_L_ID]

-- Par exemple:
-- http://localhost:3000/arena/a1b2c3d4-e5f6-7890-abcd-ef1234567890

-- =====================================================
-- 📝 NOTES
-- =====================================================
-- - Le beef est créé en mode "live" (déjà actif)
-- - Prix à 0 (gratuit)
-- - Aucun challenger (1 seul participant)
-- - Tags pour retrouver facilement
-- - Le chat fonctionnera avec cet UUID!
