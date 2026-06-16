-- Phase 4.3 — Triggers gamification Aura (beefs + beef_participants → adjust_prestige_aura)

-- 1. Fonction Trigger centralisée pour la Gamification de l'Aura
CREATE OR REPLACE FUNCTION public.trigger_gamification_aura()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  -- ACTION A : +100 Aura pour la création d'un Beef (INSERT)
  IF TG_TABLE_NAME = 'beefs' AND TG_OP = 'INSERT' THEN
    PERFORM public.adjust_prestige_aura(NEW.created_by, NEW.id, 'beef_created', 100);
    RETURN NEW;
  END IF;

  -- ACTION B : -50 Aura pour un forfait / abandon (UPDATE status = 'cancelled')
  IF TG_TABLE_NAME = 'beefs' AND TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
      PERFORM public.adjust_prestige_aura(NEW.created_by, NEW.id, 'beef_forfeited', -50);
    END IF;
    RETURN NEW;
  END IF;

  -- ACTION C : +150 Aura pour l'acceptation d'un défi (UPDATE invite_status = 'accepted')
  IF TG_TABLE_NAME = 'beef_participants' AND TG_OP = 'UPDATE' THEN
    IF NEW.invite_status = 'accepted' AND OLD.invite_status != 'accepted' THEN
      PERFORM public.adjust_prestige_aura(NEW.user_id, NEW.beef_id, 'challenge_accepted', 150);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Déploiement des écouteurs (Triggers) sur les tables

-- Écoute de la création de Beefs
DROP TRIGGER IF EXISTS trg_gamification_beefs_insert ON public.beefs;
CREATE TRIGGER trg_gamification_beefs_insert
AFTER INSERT ON public.beefs
FOR EACH ROW EXECUTE FUNCTION public.trigger_gamification_aura();

-- Écoute des annulations / forfaits de Beefs
DROP TRIGGER IF EXISTS trg_gamification_beefs_update ON public.beefs;
CREATE TRIGGER trg_gamification_beefs_update
AFTER UPDATE OF status ON public.beefs
FOR EACH ROW EXECUTE FUNCTION public.trigger_gamification_aura();

-- Écoute de l'acceptation des défis par les participants
DROP TRIGGER IF EXISTS trg_gamification_participants_update ON public.beef_participants;
CREATE TRIGGER trg_gamification_participants_update
AFTER UPDATE OF invite_status ON public.beef_participants
FOR EACH ROW EXECUTE FUNCTION public.trigger_gamification_aura();

-- 3. Renforcement de sécurité (Verrouillage final recommandé par l'audit)
REVOKE EXECUTE ON FUNCTION public.adjust_prestige_aura(UUID, UUID, TEXT, INTEGER) FROM anon, authenticated;
