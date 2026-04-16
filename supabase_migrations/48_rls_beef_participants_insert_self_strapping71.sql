-- STRAPPING #71 — INSERT public.beef_participants : l’utilisateur peut s’insérer lui-même (user_id = auth.uid()).
--
-- Contexte : erreur 403 (RLS) à la création d’un manifeste quand l’app ajoute le créateur comme participant.
-- La politique strapping 63 « beef_participants_insert_mediator_strapping63 » impose une condition sur
-- beefs (médiateur ou auteur manifeste) ; un chemin supplémentaire évite les blocages si le flux client
-- n’aligne pas exactement mediator_id / intent au moment de l’INSERT.
--
-- Les politiques INSERT coexistent : si l’une des WITH CHECK est vraie, l’INSERT est autorisé.
-- La politique médiateur / auteur manifeste (46) reste pour ajouter d’autres participants.

ALTER TABLE public.beef_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beef_participants_insert_self_strapping71" ON public.beef_participants;

CREATE POLICY "beef_participants_insert_self_strapping71"
  ON public.beef_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
  );
