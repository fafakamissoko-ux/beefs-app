-- Synchronisation gift_types ↔ lib/constants/gifts.ts (économie déflationniste)
-- Numérotation 106 : 101_prestige_ledger_adjust_prestige_aura.sql déjà présent.

UPDATE public.gift_types SET price = 150 WHERE id = 'banger';
UPDATE public.gift_types SET price = 350 WHERE id = 'wolf';
UPDATE public.gift_types SET price = 500 WHERE id = 'meteor';
UPDATE public.gift_types SET price = 1000 WHERE id = 'volcano';
UPDATE public.gift_types SET price = 2500 WHERE id = 'champion';
UPDATE public.gift_types SET price = 5000 WHERE id = 'goat';

INSERT INTO public.gift_types (id, name, emoji, price, tier, is_active)
VALUES ('money', 'Money', '💸', 250, 2, true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  price = EXCLUDED.price,
  tier = EXCLUDED.tier,
  is_active = EXCLUDED.is_active;
