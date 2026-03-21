-- =====================================================
-- CRÉATION BEEF DE TEST - MÉTHODE ULTRA-SIMPLE
-- =====================================================

-- ÉTAPE 1: Trouve ton user_id
-- Copie-colle dans Supabase SQL Editor et clique "Run"

SELECT id, email, username, display_name
FROM users
ORDER BY created_at DESC
LIMIT 5;

-- Copie l'ID de TON compte (celui avec ton email)
-- Exemple: 39bc1447-a63d-4021-8000-610414aadea7

-- =====================================================
-- ÉTAPE 2: Crée le beef
-- REMPLACE 'TON_USER_ID' par l'ID copié ci-dessus
-- =====================================================

INSERT INTO beefs (
  title,
  subject,
  description,
  mediator_id,
  status,
  price,
  tags,
  max_participants,
  created_at,
  updated_at
) VALUES (
  'Beef FAM',
  'Test',
  'Beef de test pour vérifier le chat',
  'TON_USER_ID',  -- ⚠️ REMPLACE ICI avec ton user_id
  'live',
  0,
  ARRAY['test', 'chat', 'demo'],
  10,
  NOW(),
  NOW()
) RETURNING id, title;

-- =====================================================
-- ÉTAPE 3: Copie l'ID retourné
-- =====================================================
-- Tu verras quelque chose comme:
-- id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
-- title: Beef FAM

-- Copie cet ID!

-- =====================================================
-- ÉTAPE 4: Va sur cette URL
-- =====================================================
-- http://localhost:3000/arena/[COLLE_ICI_L_ID]

-- Exemple:
-- http://localhost:3000/arena/a1b2c3d4-e5f6-7890-abcd-ef1234567890

-- =====================================================
-- 🎯 MAINTENANT TU PEUX TESTER LE CHAT!
-- =====================================================
