-- ════════════════════════════════════════════════════════════
-- FUTORA — FEED 2.0 SOCIAL UPGRADE MIGRATION
-- Run AFTER existing migrations (social, feed_v2, etc.)
-- Adds: post_media, bookmarks, notifications, post enhancements
-- ════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 1. POSTS — New columns for Feed 2.0
-- ═══════════════════════════════════════════════════════════
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS discipline_tag  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS visibility      text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'community', 'followers')),
  ADD COLUMN IF NOT EXISTS views_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bookmarks_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pinned       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_count     integer NOT NULL DEFAULT 0;


-- ═══════════════════════════════════════════════════════════
-- 2. POST_MEDIA — Photos & Videos per post
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  media_type  text NOT NULL CHECK (media_type IN ('image', 'video')),
  url         text NOT NULL,
  thumbnail   text DEFAULT NULL,
  width       integer DEFAULT NULL,
  height      integer DEFAULT NULL,
  duration_ms integer DEFAULT NULL,  -- video duration
  file_size   integer DEFAULT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media (post_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_post_media_user ON post_media (user_id);

ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Post media is publicly readable" ON post_media;
CREATE POLICY "Post media is publicly readable"
  ON post_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can upload own media" ON post_media;
CREATE POLICY "Users can upload own media"
  ON post_media FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own media" ON post_media;
CREATE POLICY "Users can delete own media"
  ON post_media FOR DELETE USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- 3. BOOKMARKS (Save posts)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bookmarks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post ON bookmarks (post_id);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see own bookmarks" ON bookmarks;
CREATE POLICY "Users can see own bookmarks"
  ON bookmarks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can bookmark posts" ON bookmarks;
CREATE POLICY "Users can bookmark posts"
  ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove bookmarks" ON bookmarks;
CREATE POLICY "Users can remove bookmarks"
  ON bookmarks FOR DELETE USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- 4. NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN (
    'like', 'comment', 'repost', 'follow', 'mention',
    'comment_like', 'achievement', 'streak_milestone', 'level_up'
  )),
  post_id      uuid REFERENCES posts(id) ON DELETE CASCADE,
  comment_id   uuid DEFAULT NULL,
  message      text DEFAULT NULL,
  is_read      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_actor ON notifications (actor_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see own notifications" ON notifications;
CREATE POLICY "Users can see own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 5. POST_REPLIES — Enhanced for nested comments
-- ═══════════════════════════════════════════════════════════
ALTER TABLE post_replies
  ADD COLUMN IF NOT EXISTS parent_reply_id uuid REFERENCES post_replies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS likes_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pinned       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS depth           integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_replies_parent ON post_replies (parent_reply_id) WHERE parent_reply_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════
-- 6. REPLY_LIKES — Like on comments
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reply_likes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reply_id  uuid NOT NULL REFERENCES post_replies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, reply_id)
);

CREATE INDEX IF NOT EXISTS idx_reply_likes_reply ON reply_likes (reply_id);

ALTER TABLE reply_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reply likes are publicly readable" ON reply_likes;
CREATE POLICY "Reply likes are publicly readable"
  ON reply_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can like replies" ON reply_likes;
CREATE POLICY "Users can like replies"
  ON reply_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike replies" ON reply_likes;
CREATE POLICY "Users can unlike replies"
  ON reply_likes FOR DELETE USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- 7. POST_VIEWS — Track unique views
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users ON DELETE SET NULL,
  ip_hash    text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_views_unique
  ON post_views (post_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views (post_id);

ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Post views insertable by anyone" ON post_views;
CREATE POLICY "Post views insertable by anyone"
  ON post_views FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Post view counts readable" ON post_views;
CREATE POLICY "Post view counts readable"
  ON post_views FOR SELECT USING (true);


-- ═══════════════════════════════════════════════════════════
-- 8. PROFILES — Add bio + discipline focus
-- ═══════════════════════════════════════════════════════════
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio             text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discipline      text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mission_statement text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_url      text DEFAULT NULL;


-- ═══════════════════════════════════════════════════════════
-- 9. FUNCTIONS — Notification triggers
-- ═══════════════════════════════════════════════════════════

-- Trigger: Create notification on post_like
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER AS $$
BEGIN
  -- Don't notify yourself
  IF NEW.user_id != (SELECT user_id FROM posts WHERE id = NEW.post_id) THEN
    INSERT INTO notifications (user_id, actor_id, type, post_id)
    VALUES (
      (SELECT user_id FROM posts WHERE id = NEW.post_id),
      NEW.user_id,
      'like',
      NEW.post_id
    );
  END IF;
  -- Update views count (approximation)
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_like ON post_likes;
CREATE TRIGGER trigger_notify_like
  AFTER INSERT ON post_likes
  FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- Trigger: Create notification on reply
CREATE OR REPLACE FUNCTION notify_on_reply()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify post author
  IF NEW.user_id != (SELECT user_id FROM posts WHERE id = NEW.post_id) THEN
    INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id)
    VALUES (
      (SELECT user_id FROM posts WHERE id = NEW.post_id),
      NEW.user_id,
      'comment',
      NEW.post_id,
      NEW.id::text
    );
  END IF;
  -- Notify parent reply author (nested)
  IF NEW.parent_reply_id IS NOT NULL THEN
    IF NEW.user_id != (SELECT user_id FROM post_replies WHERE id = NEW.parent_reply_id) THEN
      INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id)
      VALUES (
        (SELECT user_id FROM post_replies WHERE id = NEW.parent_reply_id),
        NEW.user_id,
        'comment',
        NEW.post_id,
        NEW.id::text
      );
    END IF;
  END IF;
  -- Update count
  UPDATE posts SET replies_count = replies_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_reply ON post_replies;
CREATE TRIGGER trigger_notify_reply
  AFTER INSERT ON post_replies
  FOR EACH ROW EXECUTE FUNCTION notify_on_reply();

-- Trigger: Notification on follow
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.follower_id != NEW.following_id THEN
    INSERT INTO notifications (user_id, actor_id, type)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_follow ON follows;
CREATE TRIGGER trigger_notify_follow
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- Trigger: Update bookmark count
CREATE OR REPLACE FUNCTION update_bookmark_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET bookmarks_count = bookmarks_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET bookmarks_count = GREATEST(bookmarks_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_bookmark_count ON bookmarks;
CREATE TRIGGER trigger_bookmark_count
  AFTER INSERT OR DELETE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_bookmark_count();

-- Track post view + increment counter
CREATE OR REPLACE FUNCTION record_post_view(p_post_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO post_views (post_id, user_id)
  VALUES (p_post_id, p_user_id)
  ON CONFLICT DO NOTHING;
  
  UPDATE posts SET views_count = views_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════
-- 10. STORAGE BUCKET — Post media uploads
-- ═══════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media',
  'post-media',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Public read, auth write
DROP POLICY IF EXISTS "post-media-public-read" ON storage.objects;
CREATE POLICY "post-media-public-read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "post-media-auth-upload" ON storage.objects;
CREATE POLICY "post-media-auth-upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'post-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "post-media-owner-delete" ON storage.objects;
CREATE POLICY "post-media-owner-delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ═══════════════════════════════════════════════════════════
-- 11. XP REWARDS — Post engagement XP function
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION award_engagement_xp()
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  -- +2 XP per 5 likes on a post (capped at 20 XP per post)
  FOR r IN
    SELECT p.user_id, p.id as post_id, 
           LEAST(FLOOR(p.likes_count / 5.0) * 2, 20) as xp_earned
    FROM posts p
    WHERE p.created_at > now() - interval '24 hours'
      AND p.likes_count >= 5
  LOOP
    UPDATE profiles 
    SET xp = xp + r.xp_earned,
        level = FLOOR(SQRT((xp + r.xp_earned) / 50.0))
    WHERE id = r.user_id;
  END LOOP;
  
  -- +10 XP for posts with 100+ views (once)
  UPDATE profiles SET xp = xp + 10, level = FLOOR(SQRT((xp + 10) / 50.0))
  WHERE id IN (
    SELECT DISTINCT p.user_id FROM posts p
    WHERE p.views_count >= 100
      AND p.created_at > now() - interval '7 days'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
