-- ════════════════════════════════════════════════════════════
-- FUTORA — COMPLETE DATABASE MIGRATION
-- Copy/paste this ENTIRE file into Supabase SQL Editor and run
-- ════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- PART 1: BASE SCHEMA (Profiles, Goals, Checkins, Events, Communities)
-- ═══════════════════════════════════════════════════════════

-- 1) PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username text,
  identity text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);


-- 2) GOALS
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  deadline date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own goals" ON goals;
CREATE POLICY "Users can view their own goals"
  ON goals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own goals" ON goals;
CREATE POLICY "Users can insert their own goals"
  ON goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own goals" ON goals;
CREATE POLICY "Users can update their own goals"
  ON goals FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own goals" ON goals;
CREATE POLICY "Users can delete their own goals"
  ON goals FOR DELETE
  USING (auth.uid() = user_id);


-- 3) CHECKINS
CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  goal_id uuid REFERENCES goals(id) ON DELETE CASCADE,
  minutes_worked integer,
  energy_level integer CHECK (energy_level BETWEEN 1 AND 10),
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own checkins" ON checkins;
CREATE POLICY "Users can view their own checkins"
  ON checkins FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own checkins" ON checkins;
CREATE POLICY "Users can insert their own checkins"
  ON checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own checkins" ON checkins;
CREATE POLICY "Users can update their own checkins"
  ON checkins FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own checkins" ON checkins;
CREATE POLICY "Users can delete their own checkins"
  ON checkins FOR DELETE
  USING (auth.uid() = user_id);


-- 4) PROFILES — Add XP/Level/Onboarding columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS xp              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level           integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_check_ins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS becoming        text,
  ADD COLUMN IF NOT EXISTS focus           text,
  ADD COLUMN IF NOT EXISTS commitment_level text,
  ADD COLUMN IF NOT EXISTS age             integer,
  ADD COLUMN IF NOT EXISTS location        text,
  ADD COLUMN IF NOT EXISTS streak          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_start_date date,
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_check_in   date;


-- 5) EVENTS
CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  date        timestamptz NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Events are publicly readable" ON events;
CREATE POLICY "Events are publicly readable"
  ON events FOR SELECT
  USING (true);


-- 6) COMMUNITIES
CREATE TABLE IF NOT EXISTS communities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  rating        numeric(2,1) NOT NULL DEFAULT 0,
  members_count integer NOT NULL DEFAULT 0,
  category      text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Communities are publicly readable" ON communities;
CREATE POLICY "Communities are publicly readable"
  ON communities FOR SELECT
  USING (true);


-- ═══════════════════════════════════════════════════════════
-- PART 2: REALTIME SYSTEM (User Sessions, Live Activity)
-- ═══════════════════════════════════════════════════════════

-- 1) USER SESSIONS (Online Presence)
CREATE TABLE IF NOT EXISTS user_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  last_seen  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen
  ON user_sessions (last_seen);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions (user_id);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own session" ON user_sessions;
CREATE POLICY "Users can insert own session"
  ON user_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own session" ON user_sessions;
CREATE POLICY "Users can update own session"
  ON user_sessions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own session" ON user_sessions;
CREATE POLICY "Users can delete own session"
  ON user_sessions FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sessions are publicly readable" ON user_sessions;
CREATE POLICY "Sessions are publicly readable"
  ON user_sessions FOR SELECT
  USING (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- 2) LIVE ACTIVITY FEED
CREATE TABLE IF NOT EXISTS live_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type       text NOT NULL,
  meta       jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  country_code text,
  country_name text
);

-- Drop old constraint and add new one
ALTER TABLE live_activity DROP CONSTRAINT IF EXISTS live_activity_type_check;
ALTER TABLE live_activity ADD CONSTRAINT live_activity_type_check
  CHECK (type IN ('checkin', 'levelup', 'level_up', 'join_group', 'event_join', 'login', 'follow', 'streak_milestone'));

CREATE INDEX IF NOT EXISTS idx_live_activity_created_at
  ON live_activity (created_at DESC);

ALTER TABLE live_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity feed is publicly readable" ON live_activity;
CREATE POLICY "Activity feed is publicly readable"
  ON live_activity FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert own activity" ON live_activity;
CREATE POLICY "Users can insert own activity"
  ON live_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_activity;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- 3) CHECKINS — Add date column + unique constraint
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS date date;

UPDATE checkins
  SET date = (created_at AT TIME ZONE 'UTC')::date
  WHERE date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_user_date
  ON checkins (user_id, date);

CREATE INDEX IF NOT EXISTS idx_checkins_date
  ON checkins (date);

DROP POLICY IF EXISTS "Checkins count is publicly readable" ON checkins;
CREATE POLICY "Checkins count is publicly readable"
  ON checkins FOR SELECT
  USING (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE checkins;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- 4) PROFILES — Add index + enable realtime
CREATE INDEX IF NOT EXISTS idx_profiles_xp
  ON profiles (xp DESC);

DROP POLICY IF EXISTS "Profiles are publicly readable for leaderboard" ON profiles;
CREATE POLICY "Profiles are publicly readable for leaderboard"
  ON profiles FOR SELECT
  USING (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- 5) EVENTS — Enable realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- 6) CLEANUP FUNCTION
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE last_seen < now() - interval '2 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════
-- PART 3: SOCIAL & RETENTION FEATURES (Follows, Rank History)
-- ═══════════════════════════════════════════════════════════

-- 1) FOLLOWS TABLE (Social Layer)
CREATE TABLE IF NOT EXISTS follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follows_no_self CHECK (follower_id != following_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_pair
  ON follows (follower_id, following_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see all follows" ON follows;
CREATE POLICY "Users can see all follows"
  ON follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can follow others" ON follows;
CREATE POLICY "Users can follow others"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON follows;
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE follows;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- 2) RANK HISTORY (Competitive Tracking)
CREATE TABLE IF NOT EXISTS rank_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  rank        integer NOT NULL,
  xp          integer NOT NULL DEFAULT 0,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rank_history_user_date
  ON rank_history (user_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_rank_history_date
  ON rank_history (recorded_at DESC);

ALTER TABLE rank_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rank history is publicly readable" ON rank_history;
CREATE POLICY "Rank history is publicly readable"
  ON rank_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "System can insert rank history" ON rank_history;
CREATE POLICY "System can insert rank history"
  ON rank_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- 3) PROFILES — Add social + country columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS premium_badge   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS badge_type      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS country         text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS country_code    text DEFAULT NULL;


-- 4) FUNCTION: Update follow counts
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_follow_counts ON follows;
CREATE TRIGGER trigger_follow_counts
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();


-- 5) FUNCTION: Record daily rank snapshot
CREATE OR REPLACE FUNCTION record_daily_ranks()
RETURNS void AS $$
BEGIN
  INSERT INTO rank_history (user_id, rank, xp, recorded_at)
  SELECT
    id AS user_id,
    ROW_NUMBER() OVER (ORDER BY xp DESC) AS rank,
    xp,
    CURRENT_DATE
  FROM profiles
  WHERE xp > 0
  ON CONFLICT (user_id, recorded_at) DO UPDATE
    SET rank = EXCLUDED.rank, xp = EXCLUDED.xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════
-- ✅ MIGRATION COMPLETE!
-- ════════════════════════════════════════════════════════════
-- 
-- Verify with these queries:
-- 
-- SELECT EXISTS (
--   SELECT FROM information_schema.tables 
--   WHERE table_schema = 'public' 
--   AND table_name = 'user_sessions'
-- ) AS user_sessions_exists;
-- 
-- SELECT * FROM user_sessions 
-- WHERE last_seen > NOW() - INTERVAL '30 seconds';
-- 
-- SELECT id, identity, followers_count, following_count, country 
-- FROM profiles LIMIT 3;
-- 
-- ════════════════════════════════════════════════════════════
