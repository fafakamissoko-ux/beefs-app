-- Phase 4.2 — Journalisation prestige Aura + RPC adjust_prestige_aura
-- Récompenses / pénalités (+100, +150, -50) sans altérer users.points

-- 1. Table de journalisation stricte (Garantie d'Idempotence)
CREATE TABLE IF NOT EXISTS public.prestige_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    beef_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    aura_delta INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Cette contrainte empêche de donner 2 fois la même récompense pour le même beef
    UNIQUE(user_id, beef_id, event_type)
);

-- Sécurisation de la table (verrouillage au service_role)
ALTER TABLE public.prestige_ledger ENABLE ROW LEVEL SECURITY;

-- 2. Fonction RPC pour ajuster l'Aura (Isolée du solde financier)
CREATE OR REPLACE FUNCTION public.adjust_prestige_aura(
  p_user_id UUID,
  p_beef_id UUID,
  p_event_type TEXT,
  p_delta INTEGER
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_current_aura INTEGER;
  v_new_aura INTEGER;
BEGIN
  -- 1. Tentative de journalisation. Échoue silencieusement si déjà appliqué.
  BEGIN
    INSERT INTO public.prestige_ledger (user_id, beef_id, event_type, aura_delta)
    VALUES (p_user_id, p_beef_id, p_event_type, p_delta);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_applied');
  END;

  -- 2. Lecture et verrouillage de la ligne utilisateur
  SELECT lifetime_points INTO v_current_aura FROM public.users WHERE id = p_user_id FOR UPDATE;

  -- 3. Calcul de la nouvelle Aura (Plancher à 0 pour éviter le prestige négatif)
  v_new_aura := GREATEST(0, COALESCE(v_current_aura, 0) + p_delta);

  -- 4. Application
  UPDATE public.users
  SET lifetime_points = v_new_aura
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'new_aura', v_new_aura, 'delta', p_delta);
END;
$$;

-- 3. Verrouillage des privilèges
REVOKE ALL ON FUNCTION public.adjust_prestige_aura FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_prestige_aura TO service_role;
