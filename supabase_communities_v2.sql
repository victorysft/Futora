-- ═══════════════════════════════════════════════════════════
-- FUTORA Communities v2 Migration
-- Run AFTER supabase_master_fix.sql
-- Adds: post likes, comments, tags, moderation log, soft delete
-- ═══════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────┐
-- │  1. COMMUNITY POST INTERACTIONS         │
-- └─────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS community_post_likes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS community_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) <= 1000),
  parent_id UUID REFERENCES community_post_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ┌─────────────────────────────────────────┐
-- │  2. COMMUNITY TAGS                      │
-- └─────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS community_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE (community_id, tag)
);

-- ┌─────────────────────────────────────────┐
-- │  3. MODERATION LOG                      │
-- └─────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS community_moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_post_id UUID,
  target_user_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ┌─────────────────────────────────────────┐
-- │  4. SOFT DELETE ON COMMUNITY POSTS      │
-- └─────────────────────────────────────────┘

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ┌─────────────────────────────────────────┐
-- │  5. TRIGGERS — like / comment counts    │
-- └─────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION update_community_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_post_like_count ON community_post_likes;
CREATE TRIGGER trg_community_post_like_count
  AFTER INSERT OR DELETE ON community_post_likes
  FOR EACH ROW EXECUTE FUNCTION update_community_post_like_count();

CREATE OR REPLACE FUNCTION update_community_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_community_post_comment_count ON community_post_comments;
CREATE TRIGGER trg_community_post_comment_count
  AFTER INSERT OR DELETE ON community_post_comments
  FOR EACH ROW EXECUTE FUNCTION update_community_post_comment_count();

-- ┌─────────────────────────────────────────┐
-- │  6. INDEXES                             │
-- └─────────────────────────────────────────┘

CREATE INDEX IF NOT EXISTS idx_cpl_post ON community_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_cpl_user ON community_post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_cpc_post ON community_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_ct_community ON community_tags(community_id);
CREATE INDEX IF NOT EXISTS idx_cml_community ON community_moderation_log(community_id);
CREATE INDEX IF NOT EXISTS idx_communities_members ON communities(members_count DESC);
CREATE INDEX IF NOT EXISTS idx_communities_created ON communities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_deleted ON community_posts(community_id, is_deleted);

-- ┌─────────────────────────────────────────┐
-- │  7. RLS POLICIES                        │
-- └─────────────────────────────────────────┘

ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cpl_select ON community_post_likes;
DROP POLICY IF EXISTS cpl_insert ON community_post_likes;
DROP POLICY IF EXISTS cpl_delete ON community_post_likes;
CREATE POLICY cpl_select ON community_post_likes FOR SELECT USING (TRUE);
CREATE POLICY cpl_insert ON community_post_likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY cpl_delete ON community_post_likes FOR DELETE USING (user_id = auth.uid());

ALTER TABLE community_post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cpc_select ON community_post_comments;
DROP POLICY IF EXISTS cpc_insert ON community_post_comments;
DROP POLICY IF EXISTS cpc_delete ON community_post_comments;
CREATE POLICY cpc_select ON community_post_comments FOR SELECT USING (TRUE);
CREATE POLICY cpc_insert ON community_post_comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY cpc_delete ON community_post_comments FOR DELETE USING (user_id = auth.uid());

ALTER TABLE community_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ct_select ON community_tags;
DROP POLICY IF EXISTS ct_insert ON community_tags;
CREATE POLICY ct_select ON community_tags FOR SELECT USING (TRUE);
CREATE POLICY ct_insert ON community_tags FOR INSERT WITH CHECK (TRUE);

ALTER TABLE community_moderation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cml_select ON community_moderation_log;
DROP POLICY IF EXISTS cml_insert ON community_moderation_log;
CREATE POLICY cml_select ON community_moderation_log FOR SELECT USING (TRUE);
CREATE POLICY cml_insert ON community_moderation_log FOR INSERT WITH CHECK (TRUE);

-- ┌─────────────────────────────────────────┐
-- │  8. REALTIME                            │
-- └─────────────────────────────────────────┘

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE community_post_likes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE community_post_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- DONE. Run this after supabase_master_fix.sql.
-- ═══════════════════════════════════════════════════════════
