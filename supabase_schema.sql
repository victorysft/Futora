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
