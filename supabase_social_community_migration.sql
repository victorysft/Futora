-- ════════════════════════════════════════════════════════════
-- FUTORA — SOCIAL + COMMUNITY MODULE MIGRATION
-- Run AFTER supabase_profile_social_migration.sql
-- ════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1. POSTS — Add score column for ranking feed
-- ═══════════════════════════════════════════════════════════
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS score numeric(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_score ON posts (score DESC);


-- ═══════════════════════════════════════════════════════════
-- 2. COMMUNITIES — Extend existing table
-- ═══════════════════════════════════════════════════════════
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS slug          text UNIQUE,
  ADD COLUMN IF NOT EXISTS owner_id      uuid REFERENCES auth.users ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rules         text,
  ADD COLUMN IF NOT EXISTS banner_url    text,
  ADD COLUMN IF NOT EXISTS avatar_url    text,
  ADD COLUMN IF NOT EXISTS is_private    boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities (slug);
CREATE INDEX IF NOT EXISTS idx_communities_owner ON communities (owner_id);

-- Allow authenticated users to create communities
DROP POLICY IF EXISTS "Users can create communities" ON communities;
CREATE POLICY "Users can create communities"
  ON communities FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Allow owner to update
DROP POLICY IF EXISTS "Owner can update community" ON communities;
CREATE POLICY "Owner can update community"
  ON communities FOR UPDATE
  USING (auth.uid() = owner_id);

-- Allow owner to delete
DROP POLICY IF EXISTS "Owner can delete community" ON communities;
CREATE POLICY "Owner can delete community"
  ON communities FOR DELETE
  USING (auth.uid() = owner_id);


-- ═══════════════════════════════════════════════════════════
-- 3. COMMUNITY_MEMBERS — Role-based membership
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS community_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role           text NOT NULL DEFAULT 'member',
  reputation     integer NOT NULL DEFAULT 0,
  xp             integer NOT NULL DEFAULT 0,
  level          integer NOT NULL DEFAULT 1,
  joined_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_members ADD CONSTRAINT cm_role_check
  CHECK (role IN ('owner', 'admin', 'moderator', 'member'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_unique
  ON community_members (community_id, user_id);

CREATE INDEX IF NOT EXISTS idx_cm_community ON community_members (community_id);
CREATE INDEX IF NOT EXISTS idx_cm_user ON community_members (user_id);

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members are publicly readable" ON community_members;
CREATE POLICY "Members are publicly readable"
  ON community_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can join communities" ON community_members;
CREATE POLICY "Users can join communities"
  ON community_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave communities" ON community_members;
CREATE POLICY "Users can leave communities"
  ON community_members FOR DELETE
  USING (auth.uid() = user_id);

-- Admins/owners can update roles via RPC (see below)
DROP POLICY IF EXISTS "Members can update own" ON community_members;
CREATE POLICY "Members can update own"
  ON community_members FOR UPDATE
  USING (auth.uid() = user_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_members;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 4. COMMUNITY_POSTS — Posts within a community
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS community_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type           text NOT NULL DEFAULT 'reflection',
  content        text NOT NULL,
  likes_count    integer NOT NULL DEFAULT 0,
  replies_count  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_posts ADD CONSTRAINT cp_type_check
  CHECK (type IN ('progress', 'reflection', 'mission'));

CREATE INDEX IF NOT EXISTS idx_cp_community ON community_posts (community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_user ON community_posts (user_id);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community posts are publicly readable" ON community_posts;
CREATE POLICY "Community posts are publicly readable"
  ON community_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Members can post in community" ON community_posts;
CREATE POLICY "Members can post in community"
  ON community_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own community posts" ON community_posts;
CREATE POLICY "Users can delete own community posts"
  ON community_posts FOR DELETE
  USING (auth.uid() = user_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 5. REPORTS TABLE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  target_post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  community_id   uuid REFERENCES communities(id) ON DELETE CASCADE,
  reason         text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reports ADD CONSTRAINT reports_reason_check
  CHECK (reason IN ('spam', 'toxic', 'off_topic', 'low_effort', 'other'));

ALTER TABLE reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed'));

CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create reports" ON reports;
CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can view own reports" ON reports;
CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_id);


-- ═══════════════════════════════════════════════════════════
-- 6. STRIKES TABLE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS strikes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reason         text NOT NULL,
  community_id   uuid REFERENCES communities(id) ON DELETE CASCADE,
  issued_by      uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strikes_user ON strikes (user_id);

ALTER TABLE strikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Strikes are readable by target" ON strikes;
CREATE POLICY "Strikes are readable by target"
  ON strikes FOR SELECT
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- 7. COMMUNITY_BANS TABLE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS community_bans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  banned_by      uuid REFERENCES auth.users ON DELETE SET NULL,
  reason         text,
  expires_at     timestamptz,
  is_permanent   boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cb_unique
  ON community_bans (community_id, user_id);

ALTER TABLE community_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bans are readable by target" ON community_bans;
CREATE POLICY "Bans are readable by target"
  ON community_bans FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Bans are readable by community" ON community_bans;
CREATE POLICY "Bans are readable by community"
  ON community_bans FOR SELECT
  USING (true);


-- ═══════════════════════════════════════════════════════════
-- 8. TRIGGERS — Community member count
-- ═══════════════════════════════════════════════════════════

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

DROP TRIGGER IF EXISTS trigger_cm_count ON community_members;
CREATE TRIGGER trigger_cm_count
AFTER INSERT OR DELETE ON community_members
FOR EACH ROW EXECUTE FUNCTION update_community_member_count();


-- ═══════════════════════════════════════════════════════════
-- 9. RPC — Update community member role (owner/admin only)
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_member_role(
  p_community_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
RETURNS void AS $$
DECLARE
  caller_role text;
BEGIN
  -- Get caller's role in the community
  SELECT role INTO caller_role
  FROM community_members
  WHERE community_id = p_community_id AND user_id = auth.uid();

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this community';
  END IF;

  -- Owner can assign any role
  IF caller_role = 'owner' THEN
    UPDATE community_members
    SET role = p_new_role
    WHERE community_id = p_community_id AND user_id = p_target_user_id;
    RETURN;
  END IF;

  -- Admin can assign moderator/member
  IF caller_role = 'admin' AND p_new_role IN ('moderator', 'member') THEN
    UPDATE community_members
    SET role = p_new_role
    WHERE community_id = p_community_id AND user_id = p_target_user_id
      AND role NOT IN ('owner', 'admin');
    RETURN;
  END IF;

  RAISE EXCEPTION 'Insufficient permissions';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════
-- 10. RPC — Calculate feed score
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalculate_post_scores()
RETURNS void AS $$
BEGIN
  UPDATE posts SET score =
    (likes_count * 1.2) +
    (replies_count * 1.8) +
    (reposts_count * 2.2) -
    (EXTRACT(EPOCH FROM (now() - created_at)) / 3600 * 0.1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════
-- ✅ SOCIAL + COMMUNITY MODULE MIGRATION COMPLETE!
-- ════════════════════════════════════════════════════════════
--
-- Extended: posts (score column), communities (slug, owner, rules, etc.)
-- New tables: community_members, community_posts, reports, strikes, community_bans
-- New RPCs: update_member_role, recalculate_post_scores
--
-- Verify:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--   AND table_name IN ('community_members', 'community_posts', 'reports', 'strikes', 'community_bans');
-- ════════════════════════════════════════════════════════════
