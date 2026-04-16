-- STRAPPING #68 — INSERT public.beefs : le créateur est auth.uid(), sans condition sur mediator_id.
--
-- Schéma (réf. migrations 04, 42, 46) : beefs contient notamment
--   id, created_at, title, subject, description, severity, status, …
--   mediator_id UUID NULLABLE (réf. users) — peut rester NULL à la création d’un manifeste
--   created_by UUID (réf. users) — auteur / organisateur de la ligne
--   intent TEXT CHECK (manifesto | mediation)
--
-- Ancienne politique (strapping 63) exigeait encore une combinaison intent / mediator_id à l’INSERT,
-- ce qui bloquait certains flux (manifeste) si mediator_id n’était pas exactement NULL ou si la médiation
-- devait être créée sans médiateur assigné tout de suite.

ALTER TABLE public.beefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beefs_insert_intent_strapping63" ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_intent" ON public.beefs;
DROP POLICY IF EXISTS "beefs_insert_authenticated" ON public.beefs;
DROP POLICY IF EXISTS "Authenticated users can create beefs" ON public.beefs;

CREATE POLICY "beefs_insert_creator_strapping68"
  ON public.beefs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = created_by
  );
