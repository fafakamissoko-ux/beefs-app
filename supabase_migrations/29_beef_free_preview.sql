-- Minutes de visionnage gratuit pour les spectateurs avant paiement pour la suite (défaut 10).
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS free_preview_minutes INTEGER DEFAULT 10
  CHECK (free_preview_minutes IS NULL OR (free_preview_minutes >= 0 AND free_preview_minutes <= 120));

COMMENT ON COLUMN beefs.free_preview_minutes IS
  'Durée gratuite en minutes pour les spectateurs après beef.started_at; au-delà, price (points) requis via beef_access.';
