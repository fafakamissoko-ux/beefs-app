-- Colonne destinataire explicite pour Realtime Radar (filtre receiver_id).
-- Dérivée de entity_id tant que tous les sparks ciblent un utilisateur receveur.
ALTER TABLE public.aura_sparks
  ADD COLUMN IF NOT EXISTS receiver_id uuid GENERATED ALWAYS AS (entity_id) STORED;

COMMENT ON COLUMN public.aura_sparks.receiver_id IS
  'Utilisateur qui reçoit l’étincelle (= entity_id) ; destinataire unifié profil/teaser/future extensions.';

CREATE INDEX IF NOT EXISTS idx_aura_sparks_receiver_id ON public.aura_sparks (receiver_id);

DROP VIEW IF EXISTS public.aura_notifications;

CREATE VIEW public.aura_notifications
WITH (security_invoker = true) AS
SELECT
  ('spark-' || s.id::text)::text AS id,
  s.receiver_id AS user_id,
  s.created_at,
  COALESCE(gu.display_name, gu.username, 'Quelqu''un'::text)::text AS giver_name,
  gu.username::text AS giver_username,
  s.source_kind::text AS aura_kind,
  s.giver_id AS giver_id
FROM public.aura_sparks s
INNER JOIN public.users gu ON gu.id = s.giver_id;

ALTER VIEW public.aura_notifications OWNER TO postgres;
COMMENT ON VIEW public.aura_notifications IS
  'Alertes Radar : Aura reçue (receiver_id = lecteurRadar.user_id ; lien donateur via giver_username).';

REVOKE ALL ON public.aura_notifications FROM PUBLIC;
GRANT SELECT ON public.aura_notifications TO authenticated;
