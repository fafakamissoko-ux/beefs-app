-- STRAPPING #71-B — INSERT beef_participants : auto-insertion sécurisée (créateur OU file d’attente).
--
-- Remplace la politique #71 trop large (self-insert sur n’importe quel beef).
--
-- Schéma (réf. 04, 42) :
--   beefs.created_by : créateur manifeste / médiation
--   beef_participants.invite_status : 'pending' | 'accepted' | 'declined'
--   beef_participants.is_main : challengers principaux vs file (raise-hand : is_main false + pending)
--
-- Mécanique file d’attente côté app : app/api/beef/raise-hand/route.ts — upsert pending, is_main false, beef live.

ALTER TABLE public.beef_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beef_participants_insert_self_strapping71" ON public.beef_participants;
DROP POLICY IF EXISTS "beef_participants_insert_self_smart_strapping71b" ON public.beef_participants;

CREATE POLICY "beef_participants_insert_self_smart_strapping71b"
  ON public.beef_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND (
      -- Créateur du beef / manifeste : s’ajoute (ex. invite_status accepted, is_main true)
      EXISTS (
        SELECT 1
        FROM public.beefs b
        WHERE b.id = beef_participants.beef_id
          AND b.created_by = auth.uid()
      )
      OR (
        -- File d’attente « lever la main » : même modèle que raise-hand (spectateur, beef live)
        beef_participants.invite_status = 'pending'
        AND beef_participants.is_main = false
        AND EXISTS (
          SELECT 1
          FROM public.beefs b
          WHERE b.id = beef_participants.beef_id
            AND b.status = 'live'
            AND b.mediator_id IS DISTINCT FROM auth.uid()
        )
      )
    )
  );
