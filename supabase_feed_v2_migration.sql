-- ════════════════════════════════════════════════════════════
-- FUTORA — FEED RANKING V2 + POST METRICS MIGRATION 
-- Run AFTER supabase_social_community_migration.sql
-- ════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 1. POST_METRICS — Score tracking for ranking engine
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_metrics (
  post_id            uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  base_score         numeric(12,4) NOT NULL DEFAULT 0,
  discipline_boost   numeric(12,4) NOT NULL DEFAULT 0,
  velocity_score     numeric(12,4) NOT NULL DEFAULT 0,
  recency_decay      numeric(12,4) NOT NULL DEFAULT 0,
  final_score        numeric(12,4) NOT NULL DEFAULT 0,
  interactions_2h    integer NOT NULL DEFAULT 0,
  computed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_metrics_final ON post_metrics (final_score DESC);

ALTER TABLE post_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Post metrics are publicly readable" ON post_metrics;
CREATE POLICY "Post metrics are publicly readable"
  ON post_metrics FOR SELECT USING (true);

-- Allow server-side function to update
DROP POLICY IF EXISTS "Service can update metrics" ON post_metrics;
CREATE POLICY "Service can update metrics"
  ON post_metrics FOR ALL USING (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE post_metrics;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 2. COMMUNITY_MEMBER_STATS — Contribution tracking
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS community_member_stats (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  community_id      uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  contribution_score numeric(12,2) NOT NULL DEFAULT 0,
  level             integer NOT NULL DEFAULT 0,
  posts_count       integer NOT NULL DEFAULT 0,
  replies_count     integer NOT NULL DEFAULT 0,
  engagement_score  numeric(12,2) NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, community_id)
);

CREATE INDEX IF NOT EXISTS idx_cms_community ON community_member_stats (community_id, contribution_score DESC);
CREATE INDEX IF NOT EXISTS idx_cms_user ON community_member_stats (user_id, community_id);

ALTER TABLE community_member_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Community stats are publicly readable" ON community_member_stats;
CREATE POLICY "Community stats are publicly readable"
  ON community_member_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service can update stats" ON community_member_stats;
CREATE POLICY "Service can update stats"
  ON community_member_stats FOR ALL USING (true);


-- ═══════════════════════════════════════════════════════════
-- 3. SCROLL_SESSIONS — Anti-scroll analytics
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scroll_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  duration_sec integer NOT NULL DEFAULT 0,
  page         text NOT NULL DEFAULT 'feed',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scroll_sessions_user ON scroll_sessions (user_id, created_at DESC);

ALTER TABLE scroll_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert own scroll sessions" ON scroll_sessions;
CREATE POLICY "Users can insert own scroll sessions"
  ON scroll_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can read own scroll sessions" ON scroll_sessions;
CREATE POLICY "Users can read own scroll sessions"
  ON scroll_sessions FOR SELECT USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- 4. RECALCULATE_POST_SCORES_V2 — Smart ranking RPC
-- ═══════════════════════════════════════════════════════════
-- Score formula v2:
--   baseScore = (likes * 1.3) + (replies * 2.1) + (reposts * 2.5)
--   disciplineBoost = (author_focus_score * 0.4) + (streak_days * 0.2)
--   engagementVelocity = (interactions_last_2h * 1.5)
--   recencyDecay = hours_since_post * 0.8
--   finalScore = (baseScore + disciplineBoost + engagementVelocity) - recencyDecay

CREATE OR REPLACE FUNCTION recalculate_post_scores_v2()
RETURNS void AS $$
BEGIN
  -- Upsert metrics for all posts from last 7 days
  INSERT INTO post_metrics (post_id, base_score, discipline_boost, velocity_score, recency_decay, final_score, interactions_2h, computed_at)
  SELECT
    p.id,
    -- baseScore
    (p.likes_count * 1.3) + (p.replies_count * 2.1) + (p.reposts_count * 2.5),
    -- disciplineBoost
    COALESCE((pr.total_focus_hours * 0.4) + (pr.streak * 0.2), 0),
    -- velocity (interactions in last 2 hours)
    COALESCE(v.cnt * 1.5, 0),
    -- recencyDecay
    EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 * 0.8,
    -- finalScore
    (
      (p.likes_count * 1.3) + (p.replies_count * 2.1) + (p.reposts_count * 2.5)
      + COALESCE((pr.total_focus_hours * 0.4) + (pr.streak * 0.2), 0)
      + COALESCE(v.cnt * 1.5, 0)
    ) - (EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 * 0.8),
    COALESCE(v.cnt, 0),
    now()
  FROM posts p
  LEFT JOIN profiles pr ON pr.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer as cnt FROM (
      SELECT id FROM post_likes WHERE post_id = p.id AND created_at > now() - interval '2 hours'
      UNION ALL
      SELECT id FROM post_replies WHERE post_id = p.id AND created_at > now() - interval '2 hours'
      UNION ALL
      SELECT id FROM post_reposts WHERE post_id = p.id AND created_at > now() - interval '2 hours'
    ) sub
  ) v ON true
  WHERE p.created_at > now() - interval '7 days'
  ON CONFLICT (post_id) DO UPDATE SET
    base_score = EXCLUDED.base_score,
    discipline_boost = EXCLUDED.discipline_boost,
    velocity_score = EXCLUDED.velocity_score,
    recency_decay = EXCLUDED.recency_decay,
    final_score = EXCLUDED.final_score,
    interactions_2h = EXCLUDED.interactions_2h,
    computed_at = now();

  -- Also update the score column on posts table for quick ordering
  UPDATE posts SET score = pm.final_score
  FROM post_metrics pm
  WHERE posts.id = pm.post_id
    AND posts.created_at > now() - interval '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════
-- 5. AUTO-LEVEL COMMUNITY MEMBERS
-- ═══════════════════════════════════════════════════════════
-- Level thresholds: 0-100=Learner, 100-300=Builder, 300-700=Operator, 700-1500=Architect, 1500+=Authority
CREATE OR REPLACE FUNCTION update_community_member_levels()
RETURNS void AS $$
BEGIN
  UPDATE community_member_stats SET
    level = CASE
      WHEN contribution_score >= 1500 THEN 4  -- Authority
      WHEN contribution_score >= 700  THEN 3  -- Architect
      WHEN contribution_score >= 300  THEN 2  -- Operator
      WHEN contribution_score >= 100  THEN 1  -- Builder
      ELSE 0                                  -- Learner
    END,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══════════════════════════════════════════════════════════
-- 6. ENSURE posts.score column exists (may already from prev migration)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE posts ADD COLUMN IF NOT EXISTS score numeric(12,4) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_posts_score ON posts (score DESC NULLS LAST);


-- ════════════════════════════════════════════════════════════
-- ✅ FEED V2 MIGRATION COMPLETE
-- ════════════════════════════════════════════════════════════
-- New tables: post_metrics, community_member_stats, scroll_sessions
-- New RPCs: recalculate_post_scores_v2(), update_community_member_levels()
-- 
-- To test ranking: SELECT recalculate_post_scores_v2();
-- To verify: SELECT * FROM post_metrics ORDER BY final_score DESC LIMIT 10;
-- ════════════════════════════════════════════════════════════
