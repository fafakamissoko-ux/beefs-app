-- Avis spectateurs sur la médiation (affichés sur le profil du médiateur).
-- Un compte connecté peut déposer au plus un avis par beef, s’il n’est pas le médiateur
-- ni participant accepté au ring.

CREATE TABLE IF NOT EXISTS public.mediator_viewer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  beef_id UUID NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  mediator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  CONSTRAINT mediator_viewer_reviews_one_per_beef_reviewer UNIQUE (beef_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_mvr_mediator ON public.mediator_viewer_reviews (mediator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mvr_beef ON public.mediator_viewer_reviews (beef_id);

ALTER TABLE public.mediator_viewer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvr_select_public"
  ON public.mediator_viewer_reviews FOR SELECT
  USING (true);

CREATE POLICY "mvr_insert_eligible_viewer"
  ON public.mediator_viewer_reviews FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = reviewer_id
    AND reviewer_id <> mediator_id
    AND EXISTS (
      SELECT 1 FROM public.beefs b
      WHERE b.id = beef_id
        AND b.mediator_id = mediator_id
        AND b.status IN ('ended', 'replay', 'cancelled')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.beef_participants p
      WHERE p.beef_id = beef_id
        AND p.user_id = reviewer_id
        AND p.invite_status = 'accepted'
    )
  );

GRANT SELECT ON public.mediator_viewer_reviews TO anon, authenticated;
GRANT INSERT ON public.mediator_viewer_reviews TO authenticated;

-- Met à jour users.average_rating (colonne serveur, inchangée par le self-service profil)
CREATE OR REPLACE FUNCTION public.tr_refresh_mediator_rating_from_viewer_reviews()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  target := COALESCE(NEW.mediator_id, OLD.mediator_id);
  IF target IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.users u
  SET average_rating = (
    SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)
    FROM public.mediator_viewer_reviews r
    WHERE r.mediator_id = target
  )
  WHERE u.id = target;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.tr_refresh_mediator_rating_from_viewer_reviews() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_mvr_refresh_mediator_rating ON public.mediator_viewer_reviews;
CREATE TRIGGER tr_mvr_refresh_mediator_rating
  AFTER INSERT OR DELETE OR UPDATE OF rating ON public.mediator_viewer_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.tr_refresh_mediator_rating_from_viewer_reviews();
