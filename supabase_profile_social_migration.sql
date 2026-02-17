-- ════════════════════════════════════════════════════════════
-- FUTORA — PROFILE SOCIAL / POSTS MIGRATION
-- Run this in Supabase SQL Editor AFTER the other migrations
-- ════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 1. PROFILES — Add bio and total_focus_hours columns
-- ═══════════════════════════════════════════════════════════
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio               text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_focus_hours  numeric(10,2) NOT NULL DEFAULT 0;


-- ═══════════════════════════════════════════════════════════
-- 2. POSTS TABLE — Social feed content
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'reflection',
  content      text NOT NULL,
  meta         jsonb DEFAULT '{}',
  likes_count  integer NOT NULL DEFAULT 0,
  replies_count integer NOT NULL DEFAULT 0,
  reposts_count integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE posts ADD CONSTRAINT posts_type_check
  CHECK (type IN ('progress', 'reflection', 'mission'));

CREATE INDEX IF NOT EXISTS idx_posts_user ON posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at DESC);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Posts are publicly readable" ON posts;
CREATE POLICY "Posts are publicly readable"
  ON posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create own posts" ON posts;
CREATE POLICY "Users can create own posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own posts" ON posts;
CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own posts" ON posts;
CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  USING (auth.uid() = user_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE posts;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 3. POST_LIKES TABLE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_likes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_likes_unique
  ON post_likes (post_id, user_id);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Likes are publicly readable" ON post_likes;
CREATE POLICY "Likes are publicly readable"
  ON post_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can like" ON post_likes;
CREATE POLICY "Users can like"
  ON post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike" ON post_likes;
CREATE POLICY "Users can unlike"
  ON post_likes FOR DELETE
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- 4. POST_REPLIES TABLE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_replies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_replies_post
  ON post_replies (post_id, created_at ASC);

ALTER TABLE post_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Replies are publicly readable" ON post_replies;
CREATE POLICY "Replies are publicly readable"
  ON post_replies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can reply" ON post_replies;
CREATE POLICY "Users can reply"
  ON post_replies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own replies" ON post_replies;
CREATE POLICY "Users can delete own replies"
  ON post_replies FOR DELETE
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- 5. POST_REPOSTS TABLE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_reposts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_reposts_unique
  ON post_reposts (post_id, user_id);

ALTER TABLE post_reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reposts are publicly readable" ON post_reposts;
CREATE POLICY "Reposts are publicly readable"
  ON post_reposts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can repost" ON post_reposts;
CREATE POLICY "Users can repost"
  ON post_reposts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can un-repost" ON post_reposts;
CREATE POLICY "Users can un-repost"
  ON post_reposts FOR DELETE
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- 6. TRIGGERS — Auto-update counts on posts
-- ═══════════════════════════════════════════════════════════

-- Likes count trigger
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_post_likes_count ON post_likes;
CREATE TRIGGER trigger_post_likes_count
AFTER INSERT OR DELETE ON post_likes
FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

-- Replies count trigger
CREATE OR REPLACE FUNCTION update_post_replies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET replies_count = replies_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_post_replies_count ON post_replies;
CREATE TRIGGER trigger_post_replies_count
AFTER INSERT OR DELETE ON post_replies
FOR EACH ROW EXECUTE FUNCTION update_post_replies_count();

-- Reposts count trigger
CREATE OR REPLACE FUNCTION update_post_reposts_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_post_reposts_count ON post_reposts;
CREATE TRIGGER trigger_post_reposts_count
AFTER INSERT OR DELETE ON post_reposts
FOR EACH ROW EXECUTE FUNCTION update_post_reposts_count();


-- ════════════════════════════════════════════════════════════
-- ✅ PROFILE SOCIAL MIGRATION COMPLETE!
-- ════════════════════════════════════════════════════════════
--
-- New tables: posts, post_likes, post_replies, post_reposts
-- New profile columns: bio, total_focus_hours
-- All with RLS and realtime enabled.
--
-- Verify:
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'posts');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('bio', 'total_focus_hours');
-- ════════════════════════════════════════════════════════════
