-- ════════════════════════════════════════════════════════════
-- FUTORA — DATABASE VERIFICATION
-- Run this in Supabase SQL Editor to verify everything
-- ════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 1. CHECK ALL TABLES EXIST
-- ═══════════════════════════════════════════════════════════
SELECT 
  'profiles' AS table_check,
  EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') AS exists
UNION ALL
SELECT 'goals', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'goals')
UNION ALL
SELECT 'checkins', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'checkins')
UNION ALL
SELECT 'events', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'events')
UNION ALL
SELECT 'communities', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'communities')
UNION ALL
SELECT 'user_sessions', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_sessions')
UNION ALL
SELECT 'live_activity', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'live_activity')
UNION ALL
SELECT 'follows', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'follows')
UNION ALL
SELECT 'rank_history', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rank_history');


-- ═══════════════════════════════════════════════════════════
-- 2. CHECK PROFILES COLUMNS (Should have ALL social features)
-- ═══════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;


-- ═══════════════════════════════════════════════════════════
-- 3. VERIFY CRITICAL PROFILE COLUMNS
-- ═══════════════════════════════════════════════════════════
SELECT 
  'xp' AS column_check,
  EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'xp'
  ) AS exists
UNION ALL
SELECT 'level', EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'level')
UNION ALL
SELECT 'streak', EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'streak')
UNION ALL
SELECT 'followers_count', EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'followers_count')
UNION ALL
SELECT 'following_count', EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'following_count')
UNION ALL
SELECT 'country', EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'country')
UNION ALL
SELECT 'country_code', EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'country_code')
UNION ALL
SELECT 'premium_badge', EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'premium_badge')
UNION ALL
SELECT 'verified', EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'verified');


-- ═══════════════════════════════════════════════════════════
-- 4. CHECK REALTIME PUBLICATION
-- ═══════════════════════════════════════════════════════════
SELECT 
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;


-- ═══════════════════════════════════════════════════════════
-- 5. CHECK FUNCTIONS EXIST
-- ═══════════════════════════════════════════════════════════
SELECT 
  'cleanup_stale_sessions' AS function_check,
  EXISTS (
    SELECT FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'cleanup_stale_sessions'
  ) AS exists
UNION ALL
SELECT 'update_follow_counts', EXISTS (
  SELECT FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'update_follow_counts'
)
UNION ALL
SELECT 'record_daily_ranks', EXISTS (
  SELECT FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'record_daily_ranks'
);


-- ═══════════════════════════════════════════════════════════
-- 6. CHECK TRIGGERS
-- ═══════════════════════════════════════════════════════════
SELECT 
  trigger_name,
  event_object_table AS table_name,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;


-- ═══════════════════════════════════════════════════════════
-- 7. CHECK INDEXES
-- ═══════════════════════════════════════════════════════════
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'user_sessions', 'live_activity', 'checkins', 'follows', 'rank_history')
ORDER BY tablename, indexname;


-- ═══════════════════════════════════════════════════════════
-- 8. CHECK RLS POLICIES
-- ═══════════════════════════════════════════════════════════
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd AS operation,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ═══════════════════════════════════════════════════════════
-- 9. FINAL SUMMARY
-- ═══════════════════════════════════════════════════════════
SELECT 
  'Total Tables' AS metric,
  COUNT(*)::text AS value
FROM pg_tables 
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Total Policies',
  COUNT(*)::text
FROM pg_policies
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Total Functions',
  COUNT(*)::text
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('cleanup_stale_sessions', 'update_follow_counts', 'record_daily_ranks')
UNION ALL
SELECT 
  'Tables in Realtime',
  COUNT(*)::text
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';


-- ════════════════════════════════════════════════════════════
-- ✅ EXPECTED RESULTS:
-- ════════════════════════════════════════════════════════════
-- Tables: 9 (profiles, goals, checkins, events, communities, 
--           user_sessions, live_activity, follows, rank_history)
-- 
-- Profile columns: Should include xp, level, streak, 
--                  followers_count, following_count, 
--                  country, country_code, premium_badge, verified
-- 
-- Realtime tables: 6 (profiles, checkins, events, user_sessions, 
--                     live_activity, follows)
-- 
-- Functions: 3 (cleanup_stale_sessions, update_follow_counts, 
--               record_daily_ranks)
-- 
-- Triggers: 1 (trigger_follow_counts on follows)
-- ════════════════════════════════════════════════════════════
