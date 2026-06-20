-- Phase Arène — Persistance live_summary (taps audience) + Indice de Sagesse (beefs_resolved / beefs_abandoned)

-- 1. Colonne JSONB pour les stats de fin de live (taps A–F, Ref, viewers, etc.)
ALTER TABLE public.beefs
  ADD COLUMN IF NOT EXISTS live_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.beefs.live_summary IS
  'Résumé de fin de live : résonances/taps audience (resonanceA–F, resonanceM), viewers, durée, etc.';

-- 2. Compteurs médiateur pour l''Indice de Sagesse
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS beefs_resolved INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS beefs_abandoned INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.beefs_resolved IS
  'Beefs médiés terminés avec resolution_status = resolved (maintenu par trigger).';

COMMENT ON COLUMN public.users.beefs_abandoned IS
  'Beefs médiés terminés avec resolution_status = abandoned (maintenu par trigger).';

-- 3. Backfill historique depuis beefs.resolution_status
UPDATE public.users u
SET
  beefs_resolved = COALESCE(
    (
      SELECT COUNT(*)::integer
      FROM public.beefs b
      WHERE b.mediator_id = u.id
        AND b.status IN ('ended', 'replay')
        AND b.resolution_status = 'resolved'
    ),
    0
  ),
  beefs_abandoned = COALESCE(
    (
      SELECT COUNT(*)::integer
      FROM public.beefs b
      WHERE b.mediator_id = u.id
        AND b.status IN ('ended', 'replay')
        AND b.resolution_status = 'abandoned'
    ),
    0
  );

-- 4. Trigger : incrémenter les compteurs à la clôture d''un beef (status → ended)
CREATE OR REPLACE FUNCTION public.trg_fn_update_mediator_wisdom_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' THEN
    IF NEW.mediator_id IS NOT NULL THEN
      IF NEW.resolution_status = 'resolved' THEN
        UPDATE public.users
        SET beefs_resolved = beefs_resolved + 1
        WHERE id = NEW.mediator_id;
      ELSIF NEW.resolution_status = 'abandoned' THEN
        UPDATE public.users
        SET beefs_abandoned = beefs_abandoned + 1
        WHERE id = NEW.mediator_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_mediator_wisdom_stats ON public.beefs;

CREATE TRIGGER trg_update_mediator_wisdom_stats
AFTER UPDATE ON public.beefs
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_update_mediator_wisdom_stats();

COMMENT ON FUNCTION public.trg_fn_update_mediator_wisdom_stats() IS
  'Incrémente beefs_resolved ou beefs_abandoned sur users.mediator_id quand un beef passe à status ended.';
