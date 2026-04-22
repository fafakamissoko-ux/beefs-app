-- ============================================================================
-- FIX #83 — RLS INSERT : beefs / beef_participants / beef_invitations
-- À appliquer sur la base fraîche pour débloquer les flux Manifeste + Médiation.
--
-- Symptôme avant correctif :
--   POST /rest/v1/beef_participants  →  403
--   message: new row violates row-level security policy for table "beef_participants"
--
-- Cause : lors d'un INSERT multi-lignes, PostgreSQL vérifie WITH CHECK ligne par
-- ligne. Si UNE seule ligne ne matche AUCUNE policy PERMISSIVE, tout le batch
-- est rejeté. Les policies couvrant « médiateur / auteur manifeste » étaient
-- manquantes ou obsolètes.
-- ============================================================================

BEGIN;

-- ─── Préconditions schéma (no-op si déjà bon) ───
ALTER TABLE public.beefs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_invitations   ENABLE ROW LEVEL SECURITY;

-- S'assure que `beefs.mediator_id` est bien NULLABLE (indispensable pour le mode manifeste).
ALTER TABLE public.beefs ALTER COLUMN mediator_id DROP NOT NULL;

-- Colonnes requises par le code (sans quoi le payload beefs est rejeté en 42703/23502).
ALTER TABLE public.beefs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.beefs ADD COLUMN IF NOT EXISTS intent TEXT NOT NULL DEFAULT 'mediation'
  CHECK (intent IN ('manifesto', 'mediation'));
ALTER TABLE public.beefs ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'standard'
  CHECK (event_type IN ('standard', 'prestige'));

-- ============================================================================
-- 1. beefs : reset des policies INSERT / UPDATE / DELETE
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can create beefs"          ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_authenticated"                    ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_intent"                           ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_intent_strapping63"               ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_creator_strapping68"              ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_creator"                          ON public.beefs;

DROP POLICY IF EXISTS "Mediators can update their beefs"              ON public.beefs;
DROP POLICY IF EXISTS "beefs_update_mediator_or_creator"              ON public.beefs;

DROP POLICY IF EXISTS "Mediators can delete their beefs"              ON public.beefs;
DROP POLICY IF EXISTS "beefs_delete_mediator_or_creator"              ON public.beefs;

DROP POLICY IF EXISTS "Public beefs are viewable by everyone"         ON public.beefs;
DROP POLICY IF EXISTS "beefs_select_public"                           ON public.beefs;

-- SELECT public (lecture anon + authenticated)
CREATE POLICY "beefs_select_public"
  ON public.beefs FOR SELECT USING (true);

-- INSERT : seul le créateur peut créer la ligne. Pas de contrainte supplémentaire
-- sur mediator_id ici : la cohérence manifeste/mediation est côté client.
CREATE POLICY "beefs_insert_creator"
  ON public.beefs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = created_by
  );

-- UPDATE : médiateur ou créateur
CREATE POLICY "beefs_update_mediator_or_creator"
  ON public.beefs FOR UPDATE
  USING (auth.uid() = mediator_id OR auth.uid() = created_by);

-- DELETE : médiateur ou créateur
CREATE POLICY "beefs_delete_mediator_or_creator"
  ON public.beefs FOR DELETE
  USING (auth.uid() = mediator_id OR auth.uid() = created_by);

-- ============================================================================
-- 2. beef_participants : reset complet + policies hybrides
-- ============================================================================
DROP POLICY IF EXISTS "Public participants viewable"                    ON public.beef_participants;
DROP POLICY IF EXISTS "bp_select_public"                                ON public.beef_participants;

DROP POLICY IF EXISTS "Mediators can add participants"                  ON public.beef_participants;
DROP POLICY IF EXISTS "beef_participants_insert_mediator_or_manifest_author" ON public.beef_participants;
DROP POLICY IF EXISTS "bp_insert_mediator_or_manifest_author"           ON public.beef_participants;

DROP POLICY IF EXISTS "beef_participants_insert_self_strapping71"       ON public.beef_participants;
DROP POLICY IF EXISTS "beef_participants_insert_self_smart_strapping71b" ON public.beef_participants;
DROP POLICY IF EXISTS "bp_insert_self_smart"                            ON public.beef_participants;

DROP POLICY IF EXISTS "Participants can update their status"            ON public.beef_participants;
DROP POLICY IF EXISTS "Mediators can update participants"               ON public.beef_participants;
DROP POLICY IF EXISTS "beef_participants_update_mediator_or_manifest_author" ON public.beef_participants;
DROP POLICY IF EXISTS "bp_update_self"                                  ON public.beef_participants;
DROP POLICY IF EXISTS "bp_update_mediator_or_creator"                   ON public.beef_participants;

-- Nouveaux noms introduits par ce fix — DROP défensif pour idempotence totale.
DROP POLICY IF EXISTS "bp_insert_by_creator"                            ON public.beef_participants;
DROP POLICY IF EXISTS "bp_insert_by_mediator"                           ON public.beef_participants;
DROP POLICY IF EXISTS "bp_insert_self_raisehand"                        ON public.beef_participants;

-- SELECT public
CREATE POLICY "bp_select_public"
  ON public.beef_participants FOR SELECT USING (true);

-- INSERT (policy A) : créateur du beef peut insérer n'importe quelle ligne.
-- Couvre : médiation (auth.uid() = mediator_id = created_by) + manifeste
-- (auth.uid() = created_by, mediator_id NULL).
CREATE POLICY "bp_insert_by_creator"
  ON public.beef_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND b.created_by = auth.uid()
    )
  );

-- INSERT (policy B) : médiateur nommé (différent du créateur) peut piloter ses
-- participants (cas manifeste réclamé par un médiateur tiers).
CREATE POLICY "bp_insert_by_mediator"
  ON public.beef_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND b.mediator_id = auth.uid()
    )
  );

-- INSERT (policy C) : file d'attente "raise hand" — spectateur auto-insère une
-- ligne pending / non-main sur un beef live (hors médiateur).
CREATE POLICY "bp_insert_self_raisehand"
  ON public.beef_participants FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = beef_participants.user_id
    AND beef_participants.invite_status = 'pending'
    AND beef_participants.is_main = false
    AND EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND b.status = 'live'
        AND b.mediator_id IS DISTINCT FROM auth.uid()
    )
  );

-- UPDATE : le participant gère son statut, le médiateur/créateur pilote aussi.
CREATE POLICY "bp_update_self"
  ON public.beef_participants FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "bp_update_mediator_or_creator"
  ON public.beef_participants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND (b.mediator_id = auth.uid() OR b.created_by = auth.uid())
    )
  );

-- ============================================================================
-- 3. beef_invitations : INSERT par créateur ou médiateur
-- ============================================================================
DROP POLICY IF EXISTS "Mediators can send invitations"          ON public.beef_invitations;
DROP POLICY IF EXISTS "beef_invitations_insert_mediator_or_author" ON public.beef_invitations;
DROP POLICY IF EXISTS "bi_insert_mediator_or_author"            ON public.beef_invitations;

CREATE POLICY "bi_insert_mediator_or_author"
  ON public.beef_invitations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = inviter_id
    AND EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_invitations.beef_id
        AND (b.mediator_id = auth.uid() OR b.created_by = auth.uid())
    )
  );

-- ============================================================================
-- 4. GRANTS : sans ça, le JWT authenticated n'a pas le droit objet.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beefs             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beef_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.beef_invitations  TO authenticated;
GRANT SELECT                         ON public.beefs             TO anon;
GRANT SELECT                         ON public.beef_participants TO anon;

COMMIT;

-- ============================================================================
-- Vérifications post-install (à passer en lecture dans SQL Editor) :
--
--   select polname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'public' and tablename = 'beef_participants';
--
--   -- Doit lister : bp_select_public, bp_insert_by_creator, bp_insert_by_mediator,
--   -- bp_insert_self_raisehand, bp_update_self, bp_update_mediator_or_creator.
-- ============================================================================
