-- ============================================
-- FUTORA — REALTIME GLOBAL LIVE SYSTEM
-- Run this migration in your Supabase SQL Editor
-- ============================================

-- ─────────────────────────────────────────────
-- 1) USER SESSIONS (Online Presence)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast "online users" count
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen
  ON user_sessions (last_seen);

-- Unique constraint: one session row per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions (user_id);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- User can manage their own session
CREATE POLICY "Users can insert own session"
  ON user_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own session"
  ON user_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own session"
  ON user_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Everyone can read (needed for online count)
CREATE POLICY "Sessions are publicly readable"
  ON user_sessions FOR SELECT
  USING (true);

-- Enable realtime on user_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE user_sessions;


-- ─────────────────────────────────────────────
-- 2) LIVE ACTIVITY FEED
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('checkin', 'levelup', 'join_group', 'event_join')),
  meta        jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_activity_created_at
  ON live_activity (created_at DESC);

ALTER TABLE live_activity ENABLE ROW LEVEL SECURITY;

-- Anyone can read activity feed
CREATE POLICY "Activity feed is publicly readable"
  ON live_activity FOR SELECT
  USING (true);

-- Users can insert their own activity
CREATE POLICY "Users can insert own activity"
  ON live_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime on live_activity
ALTER PUBLICATION supabase_realtime ADD TABLE live_activity;


-- ─────────────────────────────────────────────
-- 3) CHECKINS — Add date column + unique constraint
-- ─────────────────────────────────────────────
-- Add a date column for calendar-day dedup
ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS date date;

-- Backfill existing rows
UPDATE checkins
  SET date = (created_at AT TIME ZONE 'UTC')::date
  WHERE date IS NULL;

-- Unique: one check-in per user per calendar day
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_user_date
  ON checkins (user_id, date);

-- Index for fast "today's checkins" count
CREATE INDEX IF NOT EXISTS idx_checkins_date
  ON checkins (date);

-- Allow anyone to count today's checkins (aggregated read)
-- (existing RLS lets users read their own; add public SELECT for count)
CREATE POLICY "Checkins count is publicly readable"
  ON checkins FOR SELECT
  USING (true);

-- Enable realtime on checkins
ALTER PUBLICATION supabase_realtime ADD TABLE checkins;


-- ─────────────────────────────────────────────
-- 4) PROFILES — Add index + enable realtime
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_xp
  ON profiles (xp DESC);

-- Allow public read of profiles for leaderboard
CREATE POLICY "Profiles are publicly readable for leaderboard"
  ON profiles FOR SELECT
  USING (true);

-- Add last_check_in column if missing
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_check_in date;

-- Enable realtime on profiles
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;


-- ─────────────────────────────────────────────
-- 5) EVENTS — Enable realtime
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE events;


-- ─────────────────────────────────────────────
-- 6) CLEANUP FUNCTION (optional cron)
-- Removes stale sessions older than 2 minutes
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE last_seen < now() - interval '2 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
