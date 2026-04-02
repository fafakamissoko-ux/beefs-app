-- Alignement schéma `users` si la base a été créée sans certaines migrations (ex. admin / ban).
-- À exécuter sur Supabase SQL Editor si /api/admin/users renvoie « column ... does not exist ».

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
