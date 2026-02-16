-- ════════════════════════════════════════════════════════════
-- FUTORA — Social & Retention Upgrade Migration
-- ⚠️  IMPORTANT: Run supabase_realtime_migration.sql FIRST
-- (user_sessions table must exist before using presence hooks)
-- ════════════════════════════════════════════════════════════

-- ⚠️  RUN THIS FIRST TO VERIFY:
-- SELECT EXISTS (
--   SELECT FROM information_schema.tables 
--   WHERE table_schema = 'public' 
--   AND table_name = 'user_sessions'
-- ) AS user_sessions_exists;
-- If FALSE → run supabase_realtime_migration.sql first


-- ─────────────────────────────────────────────
-- 1) FOLLOWS TABLE (Social Layer)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follows_no_self CHECK (follower_id != following_id)
);

-- One unique follow per pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_pair
  ON follows (follower_id, following_id);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see all follows"
  ON follows FOR SELECT USING (true);

CREATE POLICY "Users can follow others"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id);

ALTER PUBLICATION supabase_realtime ADD TABLE follows;


-- ─────────────────────────────────────────────
-- 2) RANK HISTORY (Competitive Tracking)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rank_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  rank       integer NOT NULL,
  xp         integer NOT NULL DEFAULT 0,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE
);

-- One entry per user per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_rank_history_user_date
  ON rank_history (user_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_rank_history_date
  ON rank_history (recorded_at DESC);

ALTER TABLE rank_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rank history is publicly readable"
  ON rank_history FOR SELECT USING (true);

CREATE POLICY "System can insert rank history"
  ON rank_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 3) PROFILES — Social + Country Columns
-- ─────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS premium_badge   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS badge_type      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS country         text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS country_code    text DEFAULT NULL;


-- ─────────────────────────────────────────────
-- 4) LIVE_ACTIVITY — Allow 'level_up' type
-- ─────────────────────────────────────────────
-- Drop old constraint and add expanded one
ALTER TABLE live_activity DROP CONSTRAINT IF EXISTS live_activity_type_check;
ALTER TABLE live_activity ADD CONSTRAINT live_activity_type_check
  CHECK (type IN ('checkin', 'levelup', 'level_up', 'join_group', 'event_join', 'follow', 'streak_milestone'));


-- ─────────────────────────────────────────────
-- 5) FUNCTION: Update follow counts
-- ─────────────────────────────────────────────
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

CREATE TRIGGER trigger_follow_counts
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();


-- ─────────────────────────────────────────────
-- 6) FUNCTION: Record daily rank snapshot
-- ─────────────────────────────────────────────
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


-- ─────────────────────────────────────────────
-- 🔥 DEBUG QUERIES (uncomment to test)
-- ─────────────────────────────────────────────

-- ✅ 1) Check if user_sessions exists (should be true)
-- SELECT EXISTS (
--   SELECT FROM information_schema.tables 
--   WHERE table_schema = 'public' 
--   AND table_name = 'user_sessions'
-- ) AS user_sessions_exists;

-- ✅ 2) Check current online users
-- SELECT * FROM user_sessions 
-- WHERE last_seen > NOW() - INTERVAL '30 seconds';

-- ✅ 3) Check if follows table works
-- SELECT COUNT(*) AS total_follows FROM follows;

-- ✅ 4) Verify profile columns
-- SELECT 
--   id, identity, 
--   followers_count, following_count,
--   country, country_code,
--   premium_badge, verified
-- FROM profiles LIMIT 3;

-- ✅ 5) Test rank history
-- SELECT * FROM rank_history ORDER BY recorded_at DESC LIMIT 5;
