-- ============================================================================
-- FIX #85 — RLS INSERT public.users : policy trop stricte sur is_verified
--
-- Symptôme avant correctif :
--   POST /rest/v1/users  →  401 Unauthorized
--   code: "42501"
--   message: new row violates row-level security policy for table "users"
--
-- Cause : la policy "users_insert_self_safe" exigeait `is_verified = false`.
-- Or `lib/ensure-public-user-profile.ts` envoie `is_verified: !!user.email_confirmed_at`
-- qui vaut `true` dès qu'un signup est confirmé par email avant le 1er login.
--
-- Correctif : on garde le verrou sur l'identité (auth.uid() = id) et les
-- colonnes monétaires, on retire les verrous sur les flags de vérification
-- (gérés par le serveur / les triggers, pas par l'INSERT client).
-- ============================================================================

BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop défensif : toutes les variantes de policy INSERT vues en base
DROP POLICY IF EXISTS "Users can insert own profile"    ON public.users;
DROP POLICY IF EXISTS "users_insert_self"               ON public.users;
DROP POLICY IF EXISTS "users_insert_self_safe"          ON public.users;

-- Nouvelle policy : l'utilisateur ne peut créer QUE sa ligne, points/XP/premium
-- obligatoirement à 0/false (anti self-promotion). is_verified n'est plus vérifié :
-- c'est Supabase Auth qui gère cette information et il est normal qu'elle remonte
-- depuis le client au premier login post-confirmation email.
CREATE POLICY "users_insert_self"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(points,     0)     = 0
    AND COALESCE(xp,         0)     = 0
    AND COALESCE(is_premium, false) = false
  );

-- Grant explicite (au cas où il aurait été perdu lors d'un réalignement précédent)
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT                 ON public.users TO anon;

COMMIT;

-- ============================================================================
-- Vérif post-run :
--   select policyname, cmd, permissive, roles::text, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'users' and cmd = 'INSERT';
--
-- Attendu : 1 seule ligne, policyname = users_insert_self, permissive = PERMISSIVE.
-- ============================================================================
