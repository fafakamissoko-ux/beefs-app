-- ==========================================
-- ADD RESOLUTION STATUS TO BEEFS
-- ==========================================

-- Add resolution_status column to track mediation outcomes
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS resolution_status TEXT 
  CHECK (resolution_status IN ('resolved', 'unresolved', 'in_progress', 'abandoned'));

-- Add comment for clarity
COMMENT ON COLUMN beefs.resolution_status IS 
  'Outcome of the mediation: resolved (success), unresolved (failed), in_progress (ongoing), abandoned (cancelled)';

-- Create index for resolution status queries
CREATE INDEX IF NOT EXISTS idx_beefs_resolution_status ON beefs(resolution_status);

-- Update existing beefs based on current status
UPDATE beefs 
SET resolution_status = CASE
  WHEN status = 'ended' THEN 'resolved'  -- Assume ended beefs are resolved by default
  WHEN status = 'live' OR status = 'ready' OR status = 'scheduled' THEN 'in_progress'
  WHEN status = 'cancelled' THEN 'abandoned'
  ELSE 'in_progress'
END
WHERE resolution_status IS NULL;
