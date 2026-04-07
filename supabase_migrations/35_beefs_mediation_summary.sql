-- Résumé public de médiation (affiché sur le profil du médiateur avec ses beefs)
ALTER TABLE public.beefs ADD COLUMN IF NOT EXISTS mediation_summary TEXT;

COMMENT ON COLUMN public.beefs.mediation_summary IS
  'Texte rédigé par le médiateur, visible sur le profil public avec les beefs modérés.';
