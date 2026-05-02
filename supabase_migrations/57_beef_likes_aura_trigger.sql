-- Aura / points créateur : synchro likes → engagement du beef + prestige du created_by.
BEGIN;

ALTER TABLE public.beefs
  ADD COLUMN IF NOT EXISTS engagement_score integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.beef_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  beef_id uuid NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  UNIQUE (beef_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_beef_likes_beef_id ON public.beef_likes (beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_likes_user_id ON public.beef_likes (user_id);

CREATE OR REPLACE FUNCTION public.trg_beef_likes_aura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid uuid;
  cid uuid;
BEGIN
  IF tg_op = 'INSERT' THEN
    bid := NEW.beef_id;
  ELSE
    bid := OLD.beef_id;
  END IF;

  IF tg_op = 'INSERT' THEN
    UPDATE public.beefs
    SET engagement_score = COALESCE(engagement_score, 0) + 1
    WHERE id = bid;

    SELECT b.created_by INTO cid FROM public.beefs b WHERE b.id = bid;
    IF cid IS NOT NULL THEN
      UPDATE public.users
      SET
        lifetime_points = COALESCE(lifetime_points, 0) + 1,
        points = COALESCE(points, 0) + 1
      WHERE id = cid;
    END IF;
  ELSE
    UPDATE public.beefs
    SET engagement_score = GREATEST(0, COALESCE(engagement_score, 0) - 1)
    WHERE id = bid;

    SELECT b.created_by INTO cid FROM public.beefs b WHERE b.id = bid;
    IF cid IS NOT NULL THEN
      UPDATE public.users
      SET
        lifetime_points = GREATEST(0, COALESCE(lifetime_points, 0) - 1),
        points = GREATEST(0, COALESCE(points, 0) - 1)
      WHERE id = cid;
    END IF;
  END IF;

  RETURN CASE WHEN tg_op = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS tr_beef_likes_aura ON public.beef_likes;

CREATE TRIGGER tr_beef_likes_aura
  AFTER INSERT OR DELETE ON public.beef_likes
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_beef_likes_aura();

COMMENT ON FUNCTION public.trg_beef_likes_aura() IS
  'Like/unlike beef : +/- engagement_score du beef ; +/-1 lifetime_points et points pour users.created_by du beef (≥ 0 au retrait).';

COMMIT;
