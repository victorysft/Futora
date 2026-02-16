-- ════════════════════════════════════════════════════════════
-- FUTORA — SOCIAL + PRESENCE + LOCATION MIGRATION
-- Production-level rebuild with privacy, location, and friends
-- ════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 1. USER SESSIONS — Add session_id for multi-tab support
-- ═══════════════════════════════════════════════════════════
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS session_id text UNIQUE;

-- Create index for session_id lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id
  ON user_sessions (session_id);

-- Update cleanup function to use 60 seconds
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE last_seen < now() - interval '60 seconds';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count distinct online users (for performance)
CREATE OR REPLACE FUNCTION count_online_users(cutoff_time timestamptz)
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT COUNT(DISTINCT user_id)
    FROM user_sessions
    WHERE last_seen >= cutoff_time
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════
-- 2. PROFILES — Add location and privacy columns
-- ═══════════════════════════════════════════════════════════
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS city           text,
  ADD COLUMN IF NOT EXISTS latitude       numeric(8,5),  -- Rounded for privacy
  ADD COLUMN IF NOT EXISTS longitude      numeric(8,5),  -- Rounded for privacy
  ADD COLUMN IF NOT EXISTS timezone       text,
  ADD COLUMN IF NOT EXISTS is_private     boolean NOT NULL DEFAULT false;

-- Create indexes for geographic queries
CREATE INDEX IF NOT EXISTS idx_profiles_country_code
  ON profiles (country_code) WHERE country_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_location
  ON profiles (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;


-- ═══════════════════════════════════════════════════════════
-- 3. FOLLOWS — Add status for follow requests
-- ═══════════════════════════════════════════════════════════
ALTER TABLE follows
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted';

-- Add constraint for status values
ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_status_check;
ALTER TABLE follows ADD CONSTRAINT follows_status_check
  CHECK (status IN ('pending', 'accepted', 'declined'));

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_follows_status
  ON follows (status);

CREATE INDEX IF NOT EXISTS idx_follows_pending
  ON follows (following_id, status) WHERE status = 'pending';


-- ═══════════════════════════════════════════════════════════
-- 4. HEATMAP DATA TABLE — Store daily country activity
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS country_activity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    text NOT NULL,
  country_name    text NOT NULL,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  checkins_count  integer NOT NULL DEFAULT 0,
  levelups_count  integer NOT NULL DEFAULT 0,
  active_users    integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_country_activity_country_date
  ON country_activity (country_code, date);

CREATE INDEX IF NOT EXISTS idx_country_activity_date
  ON country_activity (date DESC);

ALTER TABLE country_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Country activity is publicly readable" ON country_activity;
CREATE POLICY "Country activity is publicly readable"
  ON country_activity FOR SELECT USING (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE country_activity;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 5. FUNCTION: Update follow counts (only count accepted)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only increment if accepted
    IF NEW.status = 'accepted' THEN
      UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
      UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- When status changes to accepted
    IF OLD.status != 'accepted' AND NEW.status = 'accepted' THEN
      UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
      UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    -- When status changes from accepted
    ELSIF OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
      UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = NEW.following_id;
      UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = NEW.follower_id;
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement if was accepted
    IF OLD.status = 'accepted' THEN
      UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
      UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger to use updated function
DROP TRIGGER IF EXISTS trigger_follow_counts ON follows;
CREATE TRIGGER trigger_follow_counts
AFTER INSERT OR UPDATE OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();


-- ═══════════════════════════════════════════════════════════
-- 6. FUNCTION: Auto-accept follow if profile is public
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_accept_follow()
RETURNS TRIGGER AS $$
DECLARE
  target_is_private boolean;
BEGIN
  -- Check if target profile is private
  SELECT is_private INTO target_is_private
  FROM profiles
  WHERE id = NEW.following_id;
  
  -- Auto-accept if public profile
  IF target_is_private = false THEN
    NEW.status := 'accepted';
  ELSE
    NEW.status := 'pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_accept_follow ON follows;
CREATE TRIGGER trigger_auto_accept_follow
BEFORE INSERT ON follows
FOR EACH ROW EXECUTE FUNCTION auto_accept_follow();


-- ═══════════════════════════════════════════════════════════
-- 7. FUNCTION: Get friends (mutual accepted follows)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_friends(user_uuid uuid)
RETURNS TABLE (
  friend_id uuid,
  username text,
  identity text,
  level integer,
  xp integer,
  is_online boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.id AS friend_id,
    p.username,
    p.identity,
    p.level,
    p.xp,
    EXISTS (
      SELECT 1 FROM user_sessions us
      WHERE us.user_id = p.id
      AND us.last_seen > now() - interval '60 seconds'
    ) AS is_online
  FROM profiles p
  WHERE p.id IN (
    -- Users that the current user follows (accepted)
    SELECT f1.following_id
    FROM follows f1
    WHERE f1.follower_id = user_uuid
    AND f1.status = 'accepted'
    -- AND they follow back (accepted)
    AND EXISTS (
      SELECT 1 FROM follows f2
      WHERE f2.follower_id = f1.following_id
      AND f2.following_id = user_uuid
      AND f2.status = 'accepted'
    )
  )
  ORDER BY p.level DESC, p.xp DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════
-- 8. FUNCTION: Update country activity (for heatmap)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_country_activity(
  p_country_code text,
  p_country_name text,
  p_activity_type text
)
RETURNS void AS $$
BEGIN
  -- Insert or update country activity for today
  INSERT INTO country_activity (country_code, country_name, date, checkins_count, levelups_count, active_users)
  VALUES (
    p_country_code,
    p_country_name,
    CURRENT_DATE,
    CASE WHEN p_activity_type = 'checkin' THEN 1 ELSE 0 END,
    CASE WHEN p_activity_type = 'levelup' THEN 1 ELSE 0 END,
    CASE WHEN p_activity_type = 'active' THEN 1 ELSE 0 END
  )
  ON CONFLICT (country_code, date)
  DO UPDATE SET
    checkins_count = CASE 
      WHEN p_activity_type = 'checkin' THEN country_activity.checkins_count + 1 
      ELSE country_activity.checkins_count 
    END,
    levelups_count = CASE 
      WHEN p_activity_type = 'levelup' THEN country_activity.levelups_count + 1 
      ELSE country_activity.levelups_count 
    END,
    active_users = CASE 
      WHEN p_activity_type = 'active' THEN country_activity.active_users + 1 
      ELSE country_activity.active_users 
    END,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════
-- 9. RLS POLICIES — Enhanced security
-- ═══════════════════════════════════════════════════════════

-- FOLLOWS: Users can update their own follow requests (to accept/decline)
DROP POLICY IF EXISTS "Users can update follows to them" ON follows;
CREATE POLICY "Users can update follows to them"
  ON follows FOR UPDATE
  USING (auth.uid() = following_id);

-- PROFILES: Private profiles only visible to accepted followers
DROP POLICY IF EXISTS "Profiles are publicly readable for leaderboard" ON profiles;
CREATE POLICY "Profiles are publicly readable for leaderboard"
  ON profiles FOR SELECT
  USING (
    -- Always visible: own profile, public profiles, or accepted followers
    auth.uid() = id
    OR is_private = false
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE f.following_id = profiles.id
      AND f.follower_id = auth.uid()
      AND f.status = 'accepted'
    )
  );


-- ═══════════════════════════════════════════════════════════
-- 10. PROFANITY FILTER — Prevent offensive identities
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profanity_filter (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word    text NOT NULL UNIQUE,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high'))
);

-- Basic profanity list (add more as needed)
INSERT INTO profanity_filter (word, severity)
VALUES 
  ('fuck', 'high'),
  ('shit', 'high'),
  ('bitch', 'high'),
  ('asshole', 'high'),
  ('dick', 'medium'),
  ('damn', 'low'),
  ('crap', 'low')
ON CONFLICT (word) DO NOTHING;

CREATE OR REPLACE FUNCTION check_profanity(input_text text)
RETURNS boolean AS $$
DECLARE
  bad_word text;
BEGIN
  -- Check if any profanity word exists in input (case-insensitive)
  FOR bad_word IN SELECT word FROM profanity_filter WHERE severity IN ('high', 'medium')
  LOOP
    IF input_text ~* bad_word THEN
      RETURN false;  -- Contains profanity
    END IF;
  END LOOP;
  RETURN true;  -- Clean
END;
$$ LANGUAGE plpgsql;

-- Add trigger to validate identity on profiles
CREATE OR REPLACE FUNCTION validate_identity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.identity IS NOT NULL AND NOT check_profanity(NEW.identity) THEN
    RAISE EXCEPTION 'Identity contains inappropriate language';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_identity ON profiles;
CREATE TRIGGER trigger_validate_identity
BEFORE INSERT OR UPDATE OF identity ON profiles
FOR EACH ROW EXECUTE FUNCTION validate_identity();


-- ════════════════════════════════════════════════════════════
-- ✅ MIGRATION COMPLETE!
-- ════════════════════════════════════════════════════════════
-- 
-- Added:
-- ✓ session_id to user_sessions (multi-tab support)
-- ✓ Location columns to profiles (city, lat, lng, timezone)
-- ✓ is_private to profiles (privacy control)
-- ✓ status to follows (pending/accepted/declined)
-- ✓ country_activity table (heatmap data)
-- ✓ Functions: get_friends, increment_country_activity
-- ✓ Auto-accept follow trigger
-- ✓ Profanity filter system
-- ✓ Enhanced RLS policies
-- 
-- Next steps:
-- 1. Create IP geolocation edge function
-- 2. Update frontend hooks (usePresence, useOnlineUsers, useCountryHeat)
-- 3. Update Globe3D with Live/Heatmap modes
-- 4. Add follow request UI
-- 5. Add privacy controls
-- ════════════════════════════════════════════════════════════
