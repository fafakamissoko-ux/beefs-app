-- ============================================================
-- Migration 18: Profile customization + display preferences
-- Banner image, accent color, theme mode, accessibility
-- ============================================================

-- Profile customization fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#E83A14';

-- Display preferences (stored as JSONB for flexibility)
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_preferences JSONB DEFAULT '{
  "theme": "dark",
  "fontSize": "normal",
  "reduceAnimations": false,
  "highContrast": false
}'::jsonb;
