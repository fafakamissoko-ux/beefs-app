-- =====================================================
-- Arène cadeaux : table gift_logs + RPC send_gift (transfert atomique)
-- =====================================================

-- Journal d'audit des envois (complète la table gifts)
CREATE TABLE IF NOT EXISTS gift_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beef_id UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  gift_type_id TEXT NOT NULL REFERENCES gift_types(id),
  points_amount INTEGER NOT NULL CHECK (points_amount > 0),
  gift_id UUID REFERENCES gifts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_logs_beef_id ON gift_logs(beef_id);
CREATE INDEX IF NOT EXISTS idx_gift_logs_sender_id ON gift_logs(sender_id);
CREATE INDEX IF NOT EXISTS idx_gift_logs_created_at ON gift_logs(created_at DESC);

-- Catalogue arène (12 cadeaux beef) — id cohérents avec l’UI TikTokStyleArena
INSERT INTO gift_types (id, name, emoji, price, tier, is_active) VALUES
  ('salt', 'Sel', '🧂', 1, 1, true),
  ('mic_drop', 'Mic Drop', '🎤', 5, 1, true),
  ('spicy', 'Spicy', '🌶️', 10, 1, true),
  ('big_brain', 'Big Brain', '🧠', 25, 1, true),
  ('lightning', 'Foudre', '⚡', 50, 2, true),
  ('ko', 'K.O.', '🥊', 99, 2, true),
  ('banger', 'Banger', '💣', 199, 2, true),
  ('wolf', 'Loup', '🐺', 500, 3, true),
  ('meteor', 'Météore', '☄️', 1000, 3, true),
  ('volcano', 'Éruption', '🌋', 2500, 3, true),
  ('champion', 'Champion', '🏆', 5000, 3, true),
  ('goat', 'G.O.A.T', '🐐', 10000, 3, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  price = EXCLUDED.price,
  tier = EXCLUDED.tier,
  is_active = EXCLUDED.is_active;

ALTER TABLE gift_logs ENABLE ROW LEVEL SECURITY;

-- Aucun accès direct client ; lecture service / audit uniquement
DROP POLICY IF EXISTS "gift_logs no direct select for anon" ON gift_logs;
CREATE POLICY "gift_logs no direct select for anon"
  ON gift_logs FOR SELECT
  USING (false);

COMMENT ON TABLE gift_logs IS 'Audit des transferts cadeau arène (jumelé à gifts)';

-- Transaction atomique : validation beef + type, solde, débit, crédit, gifts, gift_logs
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
BEGIN
  IF p_sender_id = p_recipient_id THEN
    RAISE EXCEPTION 'Destinataire invalide';
  END IF;

  IF p_points_amount < 1 OR p_points_amount > 500000 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  SELECT id, status, mediator_id
  INTO v_beef
  FROM beefs
  WHERE id = p_beef_id
  FOR UPDATE;

  IF NOT FOUND OR v_beef.status IS DISTINCT FROM 'live' OR v_beef.mediator_id IS DISTINCT FROM p_recipient_id THEN
    RAISE EXCEPTION 'Beef ou médiateur invalide';
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

  v_debit := (SELECT public.update_user_balance(
    p_sender_id,
    -p_points_amount,
    'gift_sent',
    'Cadeau envoyé (' || p_gift_type_id || ')',
    jsonb_build_object('beef_id', p_beef_id, 'recipient_id', p_recipient_id, 'gift_type_id', p_gift_type_id)
  ));

  PERFORM public.update_user_balance(
    p_recipient_id,
    p_points_amount,
    'gift_received',
    'Cadeau reçu pendant un direct',
    jsonb_build_object('beef_id', p_beef_id, 'sender_id', p_sender_id, 'gift_type_id', p_gift_type_id)
  );

  INSERT INTO gifts (beef_id, sender_id, recipient_id, gift_type_id, points_amount)
  VALUES (p_beef_id, p_sender_id, p_recipient_id, p_gift_type_id, p_points_amount)
  RETURNING id INTO v_gift_id;

  INSERT INTO gift_logs (beef_id, sender_id, recipient_id, gift_type_id, points_amount, gift_id)
  VALUES (p_beef_id, p_sender_id, p_recipient_id, p_gift_type_id, p_points_amount, v_gift_id);

  v_new_balance := (v_debit->>'new_balance')::INTEGER;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'gift_id', v_gift_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_gift(UUID, UUID, UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_gift(UUID, UUID, UUID, TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION public.send_gift IS
  'Transfert cadeau arène (JWT validé côté API) : solde, gifts + gift_logs, rollback transactionnel.';
