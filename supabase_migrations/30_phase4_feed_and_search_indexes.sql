-- Phase 4 : index pour feed / live et recherche (GlobalSearchBar)
-- À appliquer après les migrations existantes sur beefs / users.

-- Feed : tri par date (filtre « tout » sans eq status)
CREATE INDEX IF NOT EXISTS idx_beefs_created_at_desc ON public.beefs (created_at DESC);

-- Feed / admin : filtre par statut + tri récent
CREATE INDEX IF NOT EXISTS idx_beefs_status_created_at ON public.beefs (status, created_at DESC);

-- Page Live : lignes « en direct », utile pour tri par viewers côté SQL si besoin
CREATE INDEX IF NOT EXISTS idx_beefs_live_viewers ON public.beefs (viewer_count DESC)
  WHERE status = 'live';

-- Recherche texte (ilike %term%) — nécessite pg_trgm (souvent déjà sur Supabase)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_beefs_title_trgm ON public.beefs USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON public.users USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm ON public.users USING gin (display_name gin_trgm_ops);
