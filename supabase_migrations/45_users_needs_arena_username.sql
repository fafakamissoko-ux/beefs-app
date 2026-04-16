-- Sas OAuth : choix obligatoire du nom d’arène avant le feed (app/onboarding).
-- Les lignes existantes restent libres (needs_arena_username = false par défaut).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS needs_arena_username BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.needs_arena_username IS
  'Si true, l’utilisateur doit valider un pseudo arène (lettres, chiffres, _) avant d’accéder au feed / live.';
