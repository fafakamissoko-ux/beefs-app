// Script SQL à exécuter dans Supabase pour créer un beef de test

-- Récupère ton user_id (remplace l'email par le tien)
SELECT id FROM users WHERE email = 'fafa.kamissoko@gmail.com';

-- Copie l'ID retourné (exemple: 39bc1447-a63d-4021-8000-610414aadea7)

-- Crée un beef de test avec cet ID
INSERT INTO beefs (
  title,
  subject,
  mediator_id,
  status,
  price,
  tags,
  created_at
) VALUES (
  'Test Beef pour Chat',
  'Test de messagerie en direct',
  '39bc1447-a63d-4021-8000-610414aadea7', -- REMPLACE PAR TON USER ID
  'live',
  0,
  ARRAY['test', 'chat'],
  NOW()
) RETURNING id;

-- Note l'ID retourné, puis va sur:
-- http://localhost:3000/arena/[ID_RETOURNÉ]
