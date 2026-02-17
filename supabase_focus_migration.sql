-- ============================================
-- FUTORA — FOCUS COMMAND CENTER MIGRATION
-- ⚠️  RUN supabase_schema.sql FIRST!
-- ============================================

-- ─────────────────────────────────────────────
-- 1) USER_FOCUSES — Focus configuration
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_focuses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title             text NOT NULL DEFAULT 'Untitled Focus',
  becoming_role     text,
  mission_statement text,
  start_date        date NOT NULL DEFAULT CURRENT_DATE,
  target_end_date   date,
  weekly_hours_target numeric(5,1) NOT NULL DEFAULT 10,
  privacy           text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'friends', 'private')),
  is_active         boolean NOT NULL DEFAULT true,
  is_archived       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One active focus per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_focuses_active
  ON user_focuses (user_id) WHERE is_active = true AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_user_focuses_user
  ON user_focuses (user_id, is_archived, created_at DESC);

ALTER TABLE user_focuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own focuses"
  ON user_focuses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own focuses"
  ON user_focuses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own focuses"
  ON user_focuses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own focuses"
  ON user_focuses FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 2) FOCUS_TASKS — Daily Top 3 tasks
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_id      uuid NOT NULL REFERENCES user_focuses(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title         text NOT NULL,
  completed     boolean NOT NULL DEFAULT false,
  time_estimate integer, -- minutes
  sort_order    integer NOT NULL DEFAULT 0,
  task_date     date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_focus_tasks_focus_date
  ON focus_tasks (focus_id, task_date DESC);

CREATE INDEX IF NOT EXISTS idx_focus_tasks_user_date
  ON focus_tasks (user_id, task_date DESC);

ALTER TABLE focus_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own focus tasks"
  ON focus_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own focus tasks"
  ON focus_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own focus tasks"
  ON focus_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own focus tasks"
  ON focus_tasks FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 3) FOCUS_SESSIONS — Session tracking per focus
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_id    uuid NOT NULL REFERENCES user_focuses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  duration    integer NOT NULL DEFAULT 0, -- minutes
  xp_earned   integer NOT NULL DEFAULT 0,
  notes       text,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_focus
  ON focus_sessions (focus_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_week
  ON focus_sessions (user_id, session_date DESC);

ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON focus_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON focus_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON focus_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON focus_sessions FOR DELETE
  USING (auth.uid() = user_id);
