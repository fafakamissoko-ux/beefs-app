-- Aura « teaser » (modal) : compteur teaser_score séparé de engagement_score ; pas d’impact sur les points utilisateur.
BEGIN;

ALTER TABLE public.beefs
  ADD COLUMN IF NOT EXISTS teaser_score integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.teaser_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  beef_id uuid NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  UNIQUE (beef_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_teaser_likes_beef_id ON public.teaser_likes (beef_id);
CREATE INDEX IF NOT EXISTS idx_teaser_likes_user_id ON public.teaser_likes (user_id);

CREATE OR REPLACE FUNCTION public.trg_teaser_likes_sync_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid uuid;
BEGIN
  IF tg_op = 'INSERT' THEN
    bid := NEW.beef_id;
  ELSE
    bid := OLD.beef_id;
  END IF;

  IF tg_op = 'INSERT' THEN
    UPDATE public.beefs
    SET teaser_score = COALESCE(teaser_score, 0) + 1
    WHERE id = bid;
  ELSE
    UPDATE public.beefs
    SET teaser_score = GREATEST(0, COALESCE(teaser_score, 0) - 1)
    WHERE id = bid;
  END IF;

  RETURN CASE WHEN tg_op = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS tr_teaser_likes_sync_score ON public.teaser_likes;

CREATE TRIGGER tr_teaser_likes_sync_score
  AFTER INSERT OR DELETE ON public.teaser_likes
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_teaser_likes_sync_score();

ALTER TABLE public.teaser_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teaser_likes_select_public" ON public.teaser_likes;
CREATE POLICY "teaser_likes_select_public"
  ON public.teaser_likes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "teaser_likes_insert_own" ON public.teaser_likes;
CREATE POLICY "teaser_likes_insert_own"
  ON public.teaser_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "teaser_likes_delete_own" ON public.teaser_likes;
CREATE POLICY "teaser_likes_delete_own"
  ON public.teaser_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON FUNCTION public.trg_teaser_likes_sync_score() IS
  'Like/unlike teaser : +/- teaser_score sur beefs uniquement (sans points créateur).';

COMMIT;
