-- ============================================================
-- Migration 13: Viewer count increment/decrement functions
-- ============================================================

CREATE OR REPLACE FUNCTION increment_viewer_count(beef_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE beefs SET viewer_count = COALESCE(viewer_count, 0) + 1 WHERE id = beef_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_viewer_count(beef_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE beefs SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0) WHERE id = beef_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
