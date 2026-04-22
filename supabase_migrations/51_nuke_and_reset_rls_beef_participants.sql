-- ============================================================================
-- FIX #84 — RESET NUCLÉAIRE : RLS beef_participants + beefs
--
-- À exécuter SEUL (d'une traite) si la migration 50 n'a pas débloqué le 403.
-- Drop dynamique de TOUTES les policies existantes sur les deux tables, puis
-- recréation d'un set MINIMAL et strict qui match exactement submitNewBeef.ts.
-- Aucune dépendance sur un nom de policy existant : 100% défensif.
-- ============================================================================

BEGIN;

-- ─── 0. Préconditions schéma ───
ALTER TABLE public.beefs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beef_invitations  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.beefs ALTER COLUMN mediator_id DROP NOT NULL;

ALTER TABLE public.beefs ADD COLUMN IF NOT EXISTS created_by UUID
  REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.beefs ADD COLUMN IF NOT EXISTS intent TEXT NOT NULL DEFAULT 'mediation'
  CHECK (intent IN ('manifesto', 'mediation'));
ALTER TABLE public.beefs ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'standard'
  CHECK (event_type IN ('standard', 'prestige'));

-- ─── 1. DROP DYNAMIQUE : toutes les policies sur les 3 tables ───
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('beefs', 'beef_participants', 'beef_invitations')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ─── 2. GRANTS objet (RLS vérifie APRÈS le GRANT ; sans ça tout échoue) ───
GRANT SELECT                         ON public.beefs             TO anon;
GRANT SELECT                         ON public.beef_participants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beefs             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beef_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.beef_invitations  TO authenticated;

-- ─── 3. beefs : policies minimales ───
CREATE POLICY "beefs_select_public"
  ON public.beefs FOR SELECT USING (true);

CREATE POLICY "beefs_insert_creator"
  ON public.beefs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "beefs_update_mediator_or_creator"
  ON public.beefs FOR UPDATE TO authenticated
  USING (auth.uid() = mediator_id OR auth.uid() = created_by);

CREATE POLICY "beefs_delete_mediator_or_creator"
  ON public.beefs FOR DELETE TO authenticated
  USING (auth.uid() = mediator_id OR auth.uid() = created_by);

-- ─── 4. beef_participants : 3 policies INSERT PERMISSIVE, en OR ───

CREATE POLICY "bp_select_public"
  ON public.beef_participants FOR SELECT USING (true);

-- INSERT (A) : le créateur du beef peut ajouter N'IMPORTE QUI (lui-même ou tiers).
-- Couvre : manifeste (créateur auto-ajouté + invités) ET médiation (créateur = médiateur,
-- insère les 2 challengers).
CREATE POLICY "bp_insert_by_creator"
  ON public.beef_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND b.created_by = auth.uid()
    )
  );

-- INSERT (B) : médiateur désigné (réclamation de manifeste orphelin)
CREATE POLICY "bp_insert_by_mediator"
  ON public.beef_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND b.mediator_id = auth.uid()
    )
  );

-- INSERT (C) : raise-hand — spectateur s'auto-ajoute en file d'attente sur un beef live
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

-- UPDATE : propriétaire de sa ligne + pilotes (médiateur / créateur)
CREATE POLICY "bp_update_self"
  ON public.beef_participants FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "bp_update_mediator_or_creator"
  ON public.beef_participants FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND (b.mediator_id = auth.uid() OR b.created_by = auth.uid())
    )
  );

-- ─── 5. beef_invitations : INSERT auteur OR médiateur ───
CREATE POLICY "bi_select_self"
  ON public.beef_invitations FOR SELECT TO authenticated
  USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

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

CREATE POLICY "bi_update_invitee"
  ON public.beef_invitations FOR UPDATE TO authenticated
  USING (auth.uid() = invitee_id);

COMMIT;

-- ============================================================================
-- Vérif post-run à copier dans SQL Editor :
--   select polname, cmd, roles::text
--   from pg_policies where schemaname='public' and tablename='beef_participants'
--   order by cmd, polname;
--
-- Résultat attendu (exactement ces 6) :
--   bp_insert_by_creator        INSERT  {authenticated}
--   bp_insert_by_mediator       INSERT  {authenticated}
--   bp_insert_self_raisehand    INSERT  {authenticated}
--   bp_select_public            SELECT  {public}
--   bp_update_mediator_or_creator UPDATE {authenticated}
--   bp_update_self              UPDATE  {authenticated}
-- ============================================================================
