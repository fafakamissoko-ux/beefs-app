CREATE OR REPLACE FUNCTION public.send_gift(
  p_beef_id UUID,
  p_sender_id UUID,
  p_recipient_id UUID,
  p_gift_type_id TEXT,
  p_points_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_beef RECORD;
  v_gift_type RECORD;
  v_sender_points INTEGER;
  v_debit JSONB;
  v_gift_id UUID;
  v_new_balance INTEGER;
  v_creator_share INTEGER;
BEGIN
  IF p_sender_id = p_recipient_id THEN
    RAISE EXCEPTION 'Destinataire invalide';
  END IF;
  IF p_points_amount < 1 OR p_points_amount > 500000 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  -- 1. Libération du ciblage (On retire la vérification stricte du mediator_id)
  SELECT id, status, mediator_id
  INTO v_beef
  FROM beefs
  WHERE id = p_beef_id
  FOR UPDATE;
  IF NOT FOUND OR v_beef.status IS DISTINCT FROM 'live' THEN
    RAISE EXCEPTION 'Beef invalide ou non en direct';
  END IF;

  SELECT id, price, is_active
  INTO v_gift_type
  FROM gift_types
  WHERE id = p_gift_type_id;
  IF NOT FOUND OR v_gift_type.is_active = false OR v_gift_type.price != p_points_amount THEN
    RAISE EXCEPTION 'Type de cadeau invalide';
  END IF;

  SELECT points INTO v_sender_points
  FROM users
  WHERE id = p_sender_id
  FOR UPDATE;
  IF NOT FOUND OR v_sender_points < p_points_amount THEN
    RAISE EXCEPTION 'Points insuffisants';
  END IF;

  -- 2. La Taxe de l'Agora (Split 70/30)
  v_creator_share := FLOOR(p_points_amount * 0.70);

  -- Débit 100% pour l'expéditeur
  v_debit := (SELECT public.update_user_balance(
    p_sender_id,
    -p_points_amount,
    'gift_sent',
    'Cadeau envoyé (' || p_gift_type_id || ')',
    jsonb_build_object('beef_id', p_beef_id, 'recipient_id', p_recipient_id, 'gift_type_id', p_gift_type_id)
  ));

  -- Crédit 70% pour le destinataire
  PERFORM public.update_user_balance(
    p_recipient_id,
    v_creator_share,
    'gift_received',
    'Cadeau reçu pendant un direct',
    jsonb_build_object('beef_id', p_beef_id, 'sender_id', p_sender_id, 'gift_type_id', p_gift_type_id, 'platform_fee', p_points_amount - v_creator_share)
  );

  INSERT INTO gifts (beef_id, sender_id, recipient_id, gift_type_id, points_amount)
  VALUES (p_beef_id, p_sender_id, p_recipient_id, p_gift_type_id, p_points_amount)
  RETURNING id INTO v_gift_id;

  INSERT INTO gift_logs (beef_id, sender_id, recipient_id, gift_type_id, points_amount, gift_id)
  VALUES (p_beef_id, p_sender_id, p_recipient_id, p_gift_type_id, p_points_amount, v_gift_id);

  -- Fix du JSON key suite à l'économie absolue (newBalance vs new_balance)
  v_new_balance := COALESCE((v_debit->>'newBalance')::INTEGER, (v_debit->>'new_balance')::INTEGER);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'gift_id', v_gift_id
  );
END;
$$;
