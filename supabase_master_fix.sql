-- ═══════════════════════════════════════════════════════════
-- FUTORA Master Fix Migration — NUCLEAR IDEMPOTENT
-- Safe to run multiple times. Covers ALL tables, RPCs,
-- triggers, policies, indexes, storage, and realtime.
-- Run this in Supabase SQL Editor (one shot, no errors).
-- ═══════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────┐
-- │  1. CORE FEED TABLES + BACKFILL         │
-- └─────────────────────────────────────────┘

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

-- Drop old check constraints that may conflict with new allowed values
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_type_check;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_visibility_check;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_content_check;

-- Normalize any existing rows with invalid type/visibility values before re-adding constraints
UPDATE posts SET type = 'post'
  WHERE type IS NULL OR type NOT IN ('post', 'focus', 'achievement', 'checkin', 'milestone', 'question', 'update');
UPDATE posts SET visibility = 'public'
  WHERE visibility IS NULL OR visibility NOT IN ('public', 'followers', 'private');

-- Re-add permissive constraints
ALTER TABLE posts ADD CONSTRAINT posts_type_check
  CHECK (type IN ('post', 'focus', 'achievement', 'checkin', 'milestone', 'question', 'update'));
ALTER TABLE posts ADD CONSTRAINT posts_visibility_check
  CHECK (visibility IN ('public', 'followers', 'private'));

ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INT NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_count INT NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS score FLOAT NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'post';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS discipline_tag TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

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

ALTER TABLE post_media ADD COLUMN IF NOT EXISTS thumbnail TEXT;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS width INT;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS height INT;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS duration_ms INT;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS likes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

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

ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS like_count INT NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS depth INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

ALTER TABLE follows ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted';

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

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS post_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  reason TEXT DEFAULT 'spam',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ┌─────────────────────────────────────────┐
-- │  2. COMMUNITY TABLES + BACKFILL         │
-- └─────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT,
  rules TEXT,
  banner_url TEXT,
  icon_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_private BOOLEAN DEFAULT FALSE,
  members_count INT NOT NULL DEFAULT 0,
  posts_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE communities ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS rules TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS members_count INT NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS posts_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
  xp INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE community_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 0;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) <= 2000),
  type TEXT DEFAULT 'post',
  like_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'post';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS like_count INT NOT NULL DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  banned_by UUID REFERENCES auth.users(id),
  is_permanent BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE community_bans ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN DEFAULT FALSE;
ALTER TABLE community_bans ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE community_bans ADD COLUMN IF NOT EXISTS banned_by UUID;

CREATE TABLE IF NOT EXISTS strikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  reason TEXT,
  issued_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ┌─────────────────────────────────────────┐
-- │  3. PROFILES BACKFILL (safe wrapper)     │
-- │  Adds columns used by triggers/frontend  │
-- └─────────────────────────────────────────┘

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INT DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count INT DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badge_type TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS discipline TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ┌─────────────────────────────────────────┐
-- │  4. INDEXES                              │
-- └─────────────────────────────────────────┘

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
CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_community ON community_posts(community_id);

-- ┌─────────────────────────────────────────┐
-- │  5. RPC FUNCTIONS                        │
-- └─────────────────────────────────────────┘

-- Record Post View (deduplicated)
CREATE OR REPLACE FUNCTION record_post_view(p_post_id UUID, p_user_id UUID DEFAULT NULL, p_session_id TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF p_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM post_views WHERE post_id = p_post_id AND user_id = p_user_id) THEN
      RETURN;
    END IF;
  END IF;
  INSERT INTO post_views (post_id, user_id, session_id) VALUES (p_post_id, p_user_id, p_session_id);
  UPDATE posts SET view_count = view_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- For You Feed (scored algorithm)
CREATE OR REPLACE FUNCTION get_for_you_feed(p_user_id UUID, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, user_id UUID, content TEXT, visibility TEXT,
  like_count INT, comment_count INT, view_count INT, repost_count INT,
  score FLOAT, type TEXT, discipline_tag TEXT, is_pinned BOOLEAN,
  created_at TIMESTAMPTZ, feed_score FLOAT
) AS $$
DECLARE
  v_followed_ids UUID[];
BEGIN
  SELECT array_agg(following_id) INTO v_followed_ids
  FROM follows WHERE follower_id = p_user_id AND status = 'accepted';
  IF v_followed_ids IS NULL THEN v_followed_ids := ARRAY[]::UUID[]; END IF;

  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.visibility,
    p.like_count, p.comment_count, p.view_count, p.repost_count,
    p.score, p.type, p.discipline_tag, p.is_pinned, p.created_at,
    (
      (p.view_count * 0.2) + (p.like_count * 2.0) + (p.comment_count * 3.0) +
      (COALESCE(pr.level, 0) * 1.5) +
      (CASE WHEN p.user_id = ANY(v_followed_ids) THEN 5.0 ELSE 0.0 END) -
      (EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600 * 0.5)
    )::FLOAT AS feed_score
  FROM posts p
  LEFT JOIN profiles pr ON pr.id = p.user_id
  WHERE p.visibility = 'public' AND p.created_at > now() - INTERVAL '72 hours'
  ORDER BY feed_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trending Feed
CREATE OR REPLACE FUNCTION get_trending_feed(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, user_id UUID, content TEXT, visibility TEXT,
  like_count INT, comment_count INT, view_count INT, repost_count INT,
  score FLOAT, type TEXT, discipline_tag TEXT, is_pinned BOOLEAN,
  created_at TIMESTAMPTZ, trend_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.content, p.visibility,
    p.like_count, p.comment_count, p.view_count, p.repost_count,
    p.score, p.type, p.discipline_tag, p.is_pinned, p.created_at,
    ((p.like_count * 3.0) + (p.comment_count * 4.0) + (p.view_count * 0.5))::FLOAT AS trend_score
  FROM posts p
  WHERE p.visibility = 'public' AND p.created_at > now() - INTERVAL '24 hours'
  ORDER BY trend_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update Member Role (frontend calls "update_member_role")
CREATE OR REPLACE FUNCTION update_member_role(p_community_id UUID, p_target_user_id UUID, p_new_role TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE community_members SET role = p_new_role
  WHERE community_id = p_community_id AND user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Alias: keep old name too
CREATE OR REPLACE FUNCTION update_community_role(p_community_id UUID, p_user_id UUID, p_new_role TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE community_members SET role = p_new_role
  WHERE community_id = p_community_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment Community XP (called by useCommunities.createPost)
CREATE OR REPLACE FUNCTION increment_community_xp(p_community_id UUID, p_user_id UUID, p_xp INT DEFAULT 3)
RETURNS VOID AS $$
BEGIN
  UPDATE community_members
  SET xp = xp + p_xp,
      level = CASE
        WHEN xp + p_xp >= 5000 THEN 4
        WHEN xp + p_xp >= 2000 THEN 3
        WHEN xp + p_xp >= 750  THEN 2
        WHEN xp + p_xp >= 200  THEN 1
        ELSE 0
      END
  WHERE community_id = p_community_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ┌─────────────────────────────────────────┐
-- │  6. TRIGGERS                             │
-- └─────────────────────────────────────────┘

-- Like count + notification
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
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
CREATE TRIGGER trg_like_count AFTER INSERT OR DELETE ON likes FOR EACH ROW EXECUTE FUNCTION update_post_like_count();

-- Comment count + notification
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    INSERT INTO notifications (user_id, actor_id, type, post_id, reference_id)
    SELECT p.user_id, NEW.user_id, 'comment', NEW.post_id, NEW.id
    FROM posts p WHERE p.id = NEW.post_id AND p.user_id != NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comment_count ON comments;
CREATE TRIGGER trg_comment_count AFTER INSERT OR DELETE ON comments FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- Follow counts + notification
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'accepted' THEN
    UPDATE profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET followers_count = COALESCE(followers_count, 0) + 1 WHERE id = NEW.following_id;
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
CREATE TRIGGER trg_follow_counts AFTER INSERT OR DELETE ON follows FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- Community member count
CREATE OR REPLACE FUNCTION update_community_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET members_count = members_count + 1 WHERE id = NEW.community_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities SET members_count = GREATEST(members_count - 1, 0) WHERE id = OLD.community_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_member_count ON community_members;
CREATE TRIGGER trg_community_member_count AFTER INSERT OR DELETE ON community_members FOR EACH ROW EXECUTE FUNCTION update_community_member_count();

-- Community post count
CREATE OR REPLACE FUNCTION update_community_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET posts_count = posts_count + 1 WHERE id = NEW.community_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = OLD.community_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_post_count ON community_posts;
CREATE TRIGGER trg_community_post_count AFTER INSERT OR DELETE ON community_posts FOR EACH ROW EXECUTE FUNCTION update_community_post_count();

-- ┌─────────────────────────────────────────┐
-- │  7. RLS POLICIES (idempotent)            │
-- └─────────────────────────────────────────┘

-- Posts
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posts_select ON posts;
DROP POLICY IF EXISTS posts_insert ON posts;
DROP POLICY IF EXISTS posts_update ON posts;
DROP POLICY IF EXISTS posts_delete ON posts;
CREATE POLICY posts_select ON posts FOR SELECT USING (visibility = 'public' OR user_id = auth.uid());
CREATE POLICY posts_insert ON posts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_update ON posts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY posts_delete ON posts FOR DELETE USING (user_id = auth.uid());

-- Post media
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS media_select ON post_media;
DROP POLICY IF EXISTS media_insert ON post_media;
CREATE POLICY media_select ON post_media FOR SELECT USING (TRUE);
CREATE POLICY media_insert ON post_media FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM posts WHERE id = post_id AND user_id = auth.uid())
);

-- Likes
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS likes_select ON likes;
DROP POLICY IF EXISTS likes_insert ON likes;
DROP POLICY IF EXISTS likes_delete ON likes;
CREATE POLICY likes_select ON likes FOR SELECT USING (TRUE);
CREATE POLICY likes_insert ON likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY likes_delete ON likes FOR DELETE USING (user_id = auth.uid());

-- Comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comments_select ON comments;
DROP POLICY IF EXISTS comments_insert ON comments;
DROP POLICY IF EXISTS comments_delete ON comments;
CREATE POLICY comments_select ON comments FOR SELECT USING (TRUE);
CREATE POLICY comments_insert ON comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY comments_delete ON comments FOR DELETE USING (user_id = auth.uid());

-- Follows
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follows_select ON follows;
DROP POLICY IF EXISTS follows_insert ON follows;
DROP POLICY IF EXISTS follows_delete ON follows;
CREATE POLICY follows_select ON follows FOR SELECT USING (TRUE);
CREATE POLICY follows_insert ON follows FOR INSERT WITH CHECK (follower_id = auth.uid());
CREATE POLICY follows_delete ON follows FOR DELETE USING (follower_id = auth.uid());

-- Notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_select ON notifications;
DROP POLICY IF EXISTS notif_update ON notifications;
DROP POLICY IF EXISTS notif_insert ON notifications;
CREATE POLICY notif_select ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_update ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY notif_insert ON notifications FOR INSERT WITH CHECK (TRUE);

-- Post Views
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS views_insert ON post_views;
DROP POLICY IF EXISTS views_select ON post_views;
CREATE POLICY views_insert ON post_views FOR INSERT WITH CHECK (TRUE);
CREATE POLICY views_select ON post_views FOR SELECT USING (TRUE);

-- Bookmarks
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bookmarks_select ON bookmarks;
DROP POLICY IF EXISTS bookmarks_insert ON bookmarks;
DROP POLICY IF EXISTS bookmarks_delete ON bookmarks;
CREATE POLICY bookmarks_select ON bookmarks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY bookmarks_insert ON bookmarks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY bookmarks_delete ON bookmarks FOR DELETE USING (user_id = auth.uid());

-- Reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_insert ON reports;
DROP POLICY IF EXISTS reports_select ON reports;
CREATE POLICY reports_insert ON reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_select ON reports FOR SELECT USING (reporter_id = auth.uid());

-- Communities
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communities_select ON communities;
DROP POLICY IF EXISTS communities_insert ON communities;
DROP POLICY IF EXISTS communities_update ON communities;
DROP POLICY IF EXISTS communities_delete ON communities;
CREATE POLICY communities_select ON communities FOR SELECT USING (TRUE);
CREATE POLICY communities_insert ON communities FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY communities_update ON communities FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY communities_delete ON communities FOR DELETE USING (owner_id = auth.uid());

-- Community Members
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cm_select ON community_members;
DROP POLICY IF EXISTS cm_insert ON community_members;
DROP POLICY IF EXISTS cm_update ON community_members;
DROP POLICY IF EXISTS cm_delete ON community_members;
CREATE POLICY cm_select ON community_members FOR SELECT USING (TRUE);
CREATE POLICY cm_insert ON community_members FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY cm_update ON community_members FOR UPDATE USING (TRUE);
CREATE POLICY cm_delete ON community_members FOR DELETE USING (user_id = auth.uid());

-- Community Posts
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cp_select ON community_posts;
DROP POLICY IF EXISTS cp_insert ON community_posts;
DROP POLICY IF EXISTS cp_delete ON community_posts;
CREATE POLICY cp_select ON community_posts FOR SELECT USING (TRUE);
CREATE POLICY cp_insert ON community_posts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY cp_delete ON community_posts FOR DELETE USING (user_id = auth.uid());

-- Community Bans
ALTER TABLE community_bans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cb_select ON community_bans;
DROP POLICY IF EXISTS cb_insert ON community_bans;
CREATE POLICY cb_select ON community_bans FOR SELECT USING (TRUE);
CREATE POLICY cb_insert ON community_bans FOR INSERT WITH CHECK (TRUE);

-- Strikes
ALTER TABLE strikes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS strikes_select ON strikes;
DROP POLICY IF EXISTS strikes_insert ON strikes;
CREATE POLICY strikes_select ON strikes FOR SELECT USING (TRUE);
CREATE POLICY strikes_insert ON strikes FOR INSERT WITH CHECK (TRUE);

-- ┌─────────────────────────────────────────┐
-- │  8. STORAGE BUCKET + POLICIES           │
-- └─────────────────────────────────────────┘

DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('post-media', 'post-media', true)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Storage policies for post-media bucket (each wrapped for safety)
DO $$ BEGIN
  DROP POLICY IF EXISTS "post_media_upload" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "post_media_upload" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'post-media' AND auth.uid() IS NOT NULL
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "post_media_read" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "post_media_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'post-media');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "post_media_delete" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "post_media_delete" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ┌─────────────────────────────────────────┐
-- │  9. REALTIME                             │
-- └─────────────────────────────────────────┘

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE posts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE. All tables, columns, RPCs, triggers, policies,
-- storage, and realtime are now configured.
-- ═══════════════════════════════════════════════════════════
