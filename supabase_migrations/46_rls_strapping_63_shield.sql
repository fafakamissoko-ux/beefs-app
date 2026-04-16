-- ============================================================================
-- STRAPPING #63 — Bouclier RLS (users, beefs, beef_participants, beef_access)
-- À exécuter dans le SQL Editor Supabase (ou via migration CLI).
--
-- Prérequis déjà présents sur la plupart des déploiements Beefs :
--   - Vue public.user_public_profile (lecture profils tiers sans exposer users)
--   - Fonction public.is_app_admin() si vous réintroduisez une admin policy users
--
-- Effets côté app après durcissement users :
--   - SELECT sur public.users : uniquement sa propre ligne → utiliser
--     user_public_profile pour afficher les autres comptes.
--   - Aucune policy UPDATE sur users → les .update() client (settings, thème,
--     points admin) doivent passer par des routes API service_role ou une RPC.
--   - beef_participants : UPDATE « invité sur sa ligne » (page /invitations)
--     reste autorisé en plus du médiateur ; à resserrer plus tard (RPC dédiée).
-- ============================================================================

BEGIN;

-- ─── USERS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;

CREATE POLICY "users_select_own_strapping63"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

CREATE POLICY "users_insert_own_strapping63"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(points, 0) = 0
    AND COALESCE(xp, 0) = 0
    AND COALESCE(is_premium, false) = false
    AND COALESCE(is_verified, false) = false
  );

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users update own profile" ON public.users;
DROP POLICY IF EXISTS "Users update own profile safe columns" ON public.users;
DROP POLICY IF EXISTS "Admins manage all users" ON public.users;

-- Aucune policy FOR UPDATE → le rôle authenticated ne peut pas UPDATE users.
-- Le service_role et les triggers SECURITY DEFINER contournent le RLS.

-- ─── BEEFS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.beefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public beefs are viewable by everyone" ON public.beefs;
DROP POLICY IF EXISTS "beefs_select_authenticated" ON public.beefs;

CREATE POLICY "beefs_select_authenticated_strapping63"
  ON public.beefs
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create beefs" ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_authenticated" ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_intent" ON public.beefs;

CREATE POLICY "beefs_insert_intent_strapping63"
  ON public.beefs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = created_by
    AND (
      (intent = 'mediation' AND mediator_id = auth.uid())
      OR (intent = 'manifesto' AND mediator_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Mediators can update their beefs" ON public.beefs;
DROP POLICY IF EXISTS "beefs_update_mediator_or_creator" ON public.beefs;

CREATE POLICY "beefs_update_mediator_or_creator_strapping63"
  ON public.beefs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = mediator_id OR auth.uid() = created_by)
  WITH CHECK (auth.uid() = mediator_id OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Mediators can delete their beefs" ON public.beefs;
DROP POLICY IF EXISTS "beefs_delete_mediator_or_creator" ON public.beefs;

CREATE POLICY "beefs_delete_mediator_or_creator_strapping63"
  ON public.beefs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = mediator_id OR auth.uid() = created_by);

-- ─── BEEF_PARTICIPANTS ─────────────────────────────────────────────────────
ALTER TABLE public.beef_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public participants viewable" ON public.beef_participants;
DROP POLICY IF EXISTS "beef_participants_select_authenticated" ON public.beef_participants;

CREATE POLICY "beef_participants_select_public_strapping63"
  ON public.beef_participants
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Mediators can add participants" ON public.beef_participants;
DROP POLICY IF EXISTS "Participants can update their status" ON public.beef_participants;
DROP POLICY IF EXISTS "Mediators can update participants" ON public.beef_participants;
DROP POLICY IF EXISTS "beef_participants_insert_mediator_or_manifest_author" ON public.beef_participants;
DROP POLICY IF EXISTS "beef_participants_update_mediator_or_manifest_author" ON public.beef_participants;
DROP POLICY IF EXISTS "beef_participants_update_invitee_own_row" ON public.beef_participants;

CREATE POLICY "beef_participants_insert_mediator_strapping63"
  ON public.beef_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND (
          b.mediator_id = auth.uid()
          OR (b.mediator_id IS NULL AND b.created_by = auth.uid() AND b.intent = 'manifesto')
        )
    )
  );

CREATE POLICY "beef_participants_update_mediator_strapping63"
  ON public.beef_participants
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND (
          b.mediator_id = auth.uid()
          OR (b.mediator_id IS NULL AND b.created_by = auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.beefs b
      WHERE b.id = beef_participants.beef_id
        AND (
          b.mediator_id = auth.uid()
          OR (b.mediator_id IS NULL AND b.created_by = auth.uid())
        )
    )
  );

-- Réponses invitation côté invité (app/invitations) : même utilisateur que la ligne.
-- Sécurité : resserrer avec trigger colonnes ou RPC SECURITY DEFINER si besoin.
CREATE POLICY "beef_participants_update_invitee_own_row_strapping63"
  ON public.beef_participants
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── BEEF_ACCESS ───────────────────────────────────────────────────────────
ALTER TABLE public.beef_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own beef access" ON public.beef_access;
DROP POLICY IF EXISTS "System can grant beef access" ON public.beef_access;

CREATE POLICY "beef_access_select_own_strapping63"
  ON public.beef_access
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Pas de policy INSERT/UPDATE/DELETE pour authenticated : création d’accès payant
-- uniquement via service_role (API serveur).

COMMIT;
