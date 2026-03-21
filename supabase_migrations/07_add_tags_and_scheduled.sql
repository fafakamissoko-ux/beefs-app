-- ==========================================
-- ADD TAGS COLUMN TO BEEFS
-- ==========================================

-- Add tags column to beefs table (JSON array)
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add index for tag search
CREATE INDEX IF NOT EXISTS idx_beefs_tags ON beefs USING GIN(tags);

-- Also add scheduled_at column for programmed beefs
ALTER TABLE beefs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

-- Add index for scheduled beefs
CREATE INDEX IF NOT EXISTS idx_beefs_scheduled ON beefs(scheduled_at) WHERE scheduled_at IS NOT NULL;
