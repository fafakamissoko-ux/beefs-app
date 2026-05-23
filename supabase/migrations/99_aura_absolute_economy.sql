CREATE OR REPLACE FUNCTION public.update_user_balance(
  p_user_id UUID, p_amount INTEGER, p_type TEXT,
  p_description TEXT, p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
  v_aura_increase INTEGER := 0;
BEGIN
  SELECT points INTO v_current FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  v_new := v_current + p_amount;
  IF v_new < 0 AND p_type != 'refund' THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  -- Mécanique Gamification : Tout flux (positif ou négatif) augmente l'Aura, sauf retraits
  IF p_type NOT IN ('withdrawal_hold', 'refund_withdrawal') THEN
    v_aura_increase := ABS(p_amount);
  END IF;

  UPDATE public.users 
  SET 
    points = v_new, 
    lifetime_points = COALESCE(lifetime_points, 0) + v_aura_increase,
    updated_at = NOW() 
  WHERE id = p_user_id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, description, metadata)
  VALUES (p_user_id, p_type, p_amount, v_new, p_description, p_metadata);

  RETURN jsonb_build_object('success', true, 'newBalance', v_new, 'auraAdded', v_aura_increase);
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_balance FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_balance TO service_role;
