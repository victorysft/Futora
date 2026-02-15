-- ============================================
-- FUTORA - Productivity App SQL Schema
-- ============================================

-- 1) PROFILES
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text,
  identity text,
  created_at timestamp with time zone default now()
);

-- If updating existing table, run this instead:
-- ALTER TABLE profiles ADD COLUMN identity text;

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);


-- 2) GOALS
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  description text,
  deadline date,
  created_at timestamp with time zone default now()
);

alter table goals enable row level security;

create policy "Users can view their own goals"
  on goals for select
  using (auth.uid() = user_id);

create policy "Users can insert their own goals"
  on goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own goals"
  on goals for update
  using (auth.uid() = user_id);

create policy "Users can delete their own goals"
  on goals for delete
  using (auth.uid() = user_id);


-- 3) CHECKINS
create table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  goal_id uuid references goals(id) on delete cascade,
  minutes_worked integer,
  energy_level integer check (energy_level between 1 and 10),
  completed boolean default false,
  created_at timestamp with time zone default now()
);

-- If updating existing table, run this instead:
-- ALTER TABLE checkins ALTER COLUMN goal_id DROP NOT NULL;

alter table checkins enable row level security;

create policy "Users can view their own checkins"
  on checkins for select
  using (auth.uid() = user_id);

create policy "Users can insert their own checkins"
  on checkins for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own checkins"
  on checkins for update
  using (auth.uid() = user_id);

create policy "Users can delete their own checkins"
  on checkins for delete
  using (auth.uid() = user_id);


-- ============================================
-- 4) XP / LEVEL / TOTAL CHECK-INS  (migration)
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS xp              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level           integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_check_ins integer NOT NULL DEFAULT 0;


-- ============================================
-- 5) ONBOARDING PROFILE FIELDS (migration)
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS becoming          text,
  ADD COLUMN IF NOT EXISTS focus             text,
  ADD COLUMN IF NOT EXISTS commitment_level  text,
  ADD COLUMN IF NOT EXISTS age               integer,
  ADD COLUMN IF NOT EXISTS location          text,
  ADD COLUMN IF NOT EXISTS streak            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_start_date date,
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT false;


-- ============================================
-- 6) EVENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  date          timestamp with time zone NOT NULL,
  is_featured   boolean NOT NULL DEFAULT false,
  created_at    timestamp with time zone DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are publicly readable"
  ON events FOR SELECT
  USING (true);


-- ============================================
-- 7) COMMUNITIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS communities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  rating        numeric(2,1) NOT NULL DEFAULT 0,
  members_count integer NOT NULL DEFAULT 0,
  category      text,
  created_at    timestamp with time zone DEFAULT now()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Communities are publicly readable"
  ON communities FOR SELECT
  USING (true);
