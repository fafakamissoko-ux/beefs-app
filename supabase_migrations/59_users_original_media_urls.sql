-- URLs des fichiers sources (avant recadrage) pour avatar / bannière.
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_original_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_original_url TEXT;

COMMIT;
