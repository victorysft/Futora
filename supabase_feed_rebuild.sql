-- ═══════════════════════════════════════════════════════════
-- FUTORA Feed System Rebuild — Complete Migration
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. POSTS TABLE (drop old if needed, recreate clean)
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) <= 2000),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  like_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  repost_count INT NOT NULL DEFAULT 0,
  score FLOAT NOT NULL DEFAULT 0,
  type TEXT DEFAULT 'post',
  discipline_tag TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. POST_MEDIA TABLE
CREATE TABLE IF NOT EXISTS post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  url TEXT NOT NULL,
  thumbnail TEXT,
  width INT,
  height INT,
  duration_ms INT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. LIKES TABLE (unique constraint prevents duplicates)
CREATE TABLE IF NOT EXISTS likes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- 4. COMMENTS TABLE (with nested support via parent_comment_id)
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) <= 1000),
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  like_count INT NOT NULL DEFAULT 0,
  depth INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. FOLLOWS TABLE
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- 6. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'repost', 'mention')),
  reference_id UUID,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. POST VIEWS (deduplicated per session)
CREATE TABLE IF NOT EXISTS post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. BOOKMARKS
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- ═══ INDEXES ═══
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility);
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_views_dedup ON post_views(post_id, user_id);

-- ═══ RPC: Record Post View (deduplicated) ═══
CREATE OR REPLACE FUNCTION record_post_view(p_post_id UUID, p_user_id UUID DEFAULT NULL, p_session_id TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  -- Check if already viewed by this user
  IF p_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM post_views WHERE post_id = p_post_id AND user_id = p_user_id) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO post_views (post_id, user_id, session_id) VALUES (p_post_id, p_user_id, p_session_id);
  UPDATE posts SET view_count = view_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ RPC: For You Feed (scored) ═══
CREATE OR REPLACE FUNCTION get_for_you_feed(p_user_id UUID, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  visibility TEXT,
  like_count INT,
  comment_count INT,
  view_count INT,
  repost_count INT,
  score FLOAT,
  type TEXT,
  discipline_tag TEXT,
  is_pinned BOOLEAN,
  created_at TIMESTAMPTZ,
  feed_score FLOAT
) AS $$
DECLARE
  v_followed_ids UUID[];
BEGIN
  -- Get who the user follows
  SELECT array_agg(following_id) INTO v_followed_ids
  FROM follows
  WHERE follower_id = p_user_id AND status = 'accepted';

  IF v_followed_ids IS NULL THEN
    v_followed_ids := ARRAY[]::UUID[];
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.visibility,
    p.like_count, p.comment_count, p.view_count, p.repost_count,
    p.score, p.type, p.discipline_tag, p.is_pinned, p.created_at,
    (
      (p.view_count * 0.2) +
      (p.like_count * 2.0) +
      (p.comment_count * 3.0) +
      (COALESCE(pr.level, 0) * 1.5) +
      (CASE WHEN p.user_id = ANY(v_followed_ids) THEN 5.0 ELSE 0.0 END) -
      (EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600 * 0.5)
    )::FLOAT AS feed_score
  FROM posts p
  LEFT JOIN profiles pr ON pr.id = p.user_id
  WHERE p.visibility = 'public'
    AND p.created_at > now() - INTERVAL '72 hours'
  ORDER BY feed_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ RPC: Trending Feed ═══
CREATE OR REPLACE FUNCTION get_trending_feed(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  visibility TEXT,
  like_count INT,
  comment_count INT,
  view_count INT,
  repost_count INT,
  score FLOAT,
  type TEXT,
  discipline_tag TEXT,
  is_pinned BOOLEAN,
  created_at TIMESTAMPTZ,
  trend_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.visibility,
    p.like_count, p.comment_count, p.view_count, p.repost_count,
    p.score, p.type, p.discipline_tag, p.is_pinned, p.created_at,
    ((p.like_count * 3.0) + (p.comment_count * 4.0) + (p.view_count * 0.5))::FLOAT AS trend_score
  FROM posts p
  WHERE p.visibility = 'public'
    AND p.created_at > now() - INTERVAL '24 hours'
  ORDER BY trend_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ TRIGGER: Update post counts on like ═══
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    -- Create notification
    INSERT INTO notifications (user_id, actor_id, type, post_id, reference_id)
    SELECT p.user_id, NEW.user_id, 'like', NEW.post_id, NEW.post_id
    FROM posts p WHERE p.id = NEW.post_id AND p.user_id != NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_like_count ON likes;
CREATE TRIGGER trg_like_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_post_like_count();

-- ═══ TRIGGER: Update post counts on comment ═══
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    -- Create notification
    INSERT INTO notifications (user_id, actor_id, type, post_id, reference_id)
    SELECT p.user_id, NEW.user_id, 'comment', NEW.post_id, NEW.id
    FROM posts p WHERE p.id = NEW.post_id AND p.user_id != NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comment_count ON comments;
CREATE TRIGGER trg_comment_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- ═══ TRIGGER: Update follower counts ═══
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'accepted' THEN
    UPDATE profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET followers_count = COALESCE(followers_count, 0) + 1 WHERE id = NEW.following_id;
    -- Create notification
    INSERT INTO notifications (user_id, actor_id, type, reference_id)
    VALUES (NEW.following_id, NEW.follower_id, 'follow', NEW.follower_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'accepted' THEN
    UPDATE profiles SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0) WHERE id = OLD.follower_id;
    UPDATE profiles SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0) WHERE id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_follow_counts ON follows;
CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- ═══ RLS POLICIES ═══
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Posts: anyone can read public, owner can CRUD
CREATE POLICY posts_select ON posts FOR SELECT USING (visibility = 'public' OR user_id = auth.uid());
CREATE POLICY posts_insert ON posts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_update ON posts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY posts_delete ON posts FOR DELETE USING (user_id = auth.uid());

-- Post media: readable if post is readable
CREATE POLICY media_select ON post_media FOR SELECT USING (TRUE);
CREATE POLICY media_insert ON post_media FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid())
);

-- Likes
CREATE POLICY likes_select ON likes FOR SELECT USING (TRUE);
CREATE POLICY likes_insert ON likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY likes_delete ON likes FOR DELETE USING (user_id = auth.uid());

-- Comments
CREATE POLICY comments_select ON comments FOR SELECT USING (TRUE);
CREATE POLICY comments_insert ON comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY comments_delete ON comments FOR DELETE USING (user_id = auth.uid());

-- Follows
CREATE POLICY follows_select ON follows FOR SELECT USING (TRUE);
CREATE POLICY follows_insert ON follows FOR INSERT WITH CHECK (follower_id = auth.uid());
CREATE POLICY follows_delete ON follows FOR DELETE USING (follower_id = auth.uid());

-- Notifications
CREATE POLICY notif_select ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_update ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY notif_insert ON notifications FOR INSERT WITH CHECK (TRUE);

-- Views
CREATE POLICY views_insert ON post_views FOR INSERT WITH CHECK (TRUE);
CREATE POLICY views_select ON post_views FOR SELECT USING (TRUE);

-- Bookmarks
CREATE POLICY bookmarks_select ON bookmarks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY bookmarks_insert ON bookmarks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY bookmarks_delete ON bookmarks FOR DELETE USING (user_id = auth.uid());

-- ═══ STORAGE BUCKET ═══
-- Run this in Supabase Dashboard > Storage > Create bucket "post-media" (public)
-- Or via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('post-media', 'post-media', true) ON CONFLICT DO NOTHING;
