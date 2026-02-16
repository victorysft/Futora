-- ════════════════════════════════════════════════════════════
-- FUTORA Geographic Heat Visualization Migration
-- Adds country-level tracking to user_sessions (privacy-first)
-- ════════════════════════════════════════════════════════════

-- Add country columns to user_sessions
ALTER TABLE user_sessions
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS country_name TEXT,
ADD COLUMN IF NOT EXISTS lat DECIMAL(9,6),
ADD COLUMN IF NOT EXISTS lng DECIMAL(9,6);

-- Create index for country queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_country 
ON user_sessions(country_code) 
WHERE country_code IS NOT NULL;

-- Add country columns to live_activity for event tracking
ALTER TABLE live_activity
ADD COLUMN IF NOT EXISTS country_code TEXT,
ADD COLUMN IF NOT EXISTS country_name TEXT;

-- Create index for activity by country
CREATE INDEX IF NOT EXISTS idx_live_activity_country 
ON live_activity(country_code, created_at) 
WHERE country_code IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN user_sessions.country_code IS 'ISO-2 country code (e.g., US, NL, BR) - country level only, no precise tracking';
COMMENT ON COLUMN user_sessions.country_name IS 'Full country name for display (e.g., United States, Netherlands)';
COMMENT ON COLUMN user_sessions.lat IS 'Country centroid latitude - approximate country center only';
COMMENT ON COLUMN user_sessions.lng IS 'Country centroid longitude - approximate country center only';

-- ════════════════════════════════════════════════════════════
-- PRIVACY NOTICE
-- ════════════════════════════════════════════════════════════
-- This migration only adds COUNTRY-LEVEL tracking.
-- No city-level or precise coordinates are stored.
-- Lat/lng values represent country centroids, not user locations.
-- ════════════════════════════════════════════════════════════
