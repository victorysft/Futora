-- ============================================
-- FUTORA — REALTIME GLOBAL LIVE SYSTEM
-- ⚠️  RUN supabase_schema.sql FIRST!
-- (Creates profiles, goals, checkins, events, communities tables)
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
-- 3) CHECKINS — Add date column (if table exists)
-- ─────────────────────────────────────────────
-- Only run if checkins table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkins') THEN
    -- Add date column for calendar-day dedup
    ALTER TABLE checkins ADD COLUMN IF NOT EXISTS date date;
    
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
    
    -- Enable realtime on checkins
    ALTER PUBLICATION supabase_realtime ADD TABLE checkins;
    
    RAISE NOTICE '✓ Checkins table updated';
  ELSE
    RAISE WARNING '⚠ Checkins table does not exist - run supabase_schema.sql first';
  END IF;
END $$;

-- Allow anyone to count today's checkins (aggregated read)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'checkins') THEN
    EXECUTE 'CREATE POLICY IF NOT EXISTS "Checkins count is publicly readable"
      ON checkins FOR SELECT
      USING (true)';
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 4) PROFILES — Add index + enable realtime (if exists)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profiles') THEN
    CREATE INDEX IF NOT EXISTS idx_profiles_xp
      ON profiles (xp DESC);
    
    -- Add last_check_in column if missing
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_check_in date;
    
    -- Enable realtime on profiles
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    
    RAISE NOTICE '✓ Profiles table updated';
  ELSE
    RAISE WARNING '⚠ Profiles table does not exist - run supabase_schema.sql first';
  END IF;
END $$;

-- Allow public read of profiles for leaderboard
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profiles') THEN
    EXECUTE 'CREATE POLICY IF NOT EXISTS "Profiles are publicly readable for leaderboard"
      ON profiles FOR SELECT
      USING (true)';
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 5) EVENTS — Enable realtime (if exists)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
    RAISE NOTICE '✓ Events table enabled for realtime';
  ELSE
    RAISE WARNING '⚠ Events table does not exist - this is optional';
  END IF;
END $$;


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
