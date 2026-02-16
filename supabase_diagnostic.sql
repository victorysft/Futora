-- ════════════════════════════════════════════════════════════
-- FUTORA — BACKEND VERIFICATION & DIAGNOSTIC
-- Run this in Supabase SQL Editor to diagnose issues
-- ════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- STAP 1: CHECK ALLE TABLES EN COLUMNS
-- ═══════════════════════════════════════════════════════════

-- 1A. Check if critical tables exist
SELECT 
  'user_sessions' AS table_name,
  EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_sessions') AS exists
UNION ALL
SELECT 'follows', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'follows')
UNION ALL
SELECT 'rank_history', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rank_history')
UNION ALL
SELECT 'country_activity', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'country_activity')
UNION ALL
SELECT 'profanity_filter', EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profanity_filter');

-- ❌ If any shows "false" → Migration NOT run correctly
-- ✅ All should show "true"


-- 1B. Check user_sessions has session_id column
SELECT 
  'user_sessions.session_id' AS column_check,
  EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'user_sessions' AND column_name = 'session_id'
  ) AS exists;

-- ❌ If false → Run supabase_social_presence_migration.sql


-- 1C. Check profiles has all location + privacy columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND column_name IN ('is_private', 'country', 'country_code', 'city', 'latitude', 'longitude', 'timezone')
ORDER BY column_name;

-- ✅ Should show 7 rows: is_private, country, country_code, city, latitude, longitude, timezone
-- ❌ If less → Migration incomplete


-- 1D. Check follows has status column
SELECT 
  'follows.status' AS column_check,
  EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'follows' AND column_name = 'status'
  ) AS exists;

-- ❌ If false → Run migration again


-- ═══════════════════════════════════════════════════════════
-- STAP 2: WAAROM ZIE JE 0 ONLINE?
-- ═══════════════════════════════════════════════════════════

-- 2A. Check if ANY sessions exist at all
SELECT COUNT(*) AS total_sessions
FROM user_sessions;

-- ❌ If 0 → usePresence hook not working (frontend issue)
-- ✅ If > 0 → Continue to next check


-- 2B. Check ACTIVE sessions (last 60 seconds)
SELECT 
  user_id, 
  session_id,
  last_seen,
  now() - last_seen AS time_since_last_seen,
  CASE 
    WHEN last_seen > now() - interval '60 seconds' THEN '✅ ACTIVE'
    ELSE '❌ STALE'
  END AS status
FROM user_sessions
ORDER BY last_seen DESC;

-- Look for:
-- ✅ session_id should be unique per tab/session
-- ✅ last_seen should be within 60 seconds for online users
-- ❌ If all sessions are STALE → Heartbeat not working
-- ❌ If no sessions at all → usePresence not called


-- 2C. Count DISTINCT online users (what frontend should show)
SELECT COUNT(DISTINCT user_id) AS online_count
FROM user_sessions
WHERE last_seen > now() - interval '60 seconds';

-- This is the CORRECT online count
-- Compare this to what your frontend shows


-- 2D. Check if current user has a session
-- Replace 'YOUR_USER_ID' with your actual user ID
SELECT 
  user_id,
  session_id,
  last_seen,
  now() - last_seen AS age
FROM user_sessions
WHERE user_id = 'YOUR_USER_ID';

-- ❌ If no rows → Your session is not being created
-- ✅ If row exists with recent last_seen → Session working


-- 2E. Test cleanup function
SELECT cleanup_stale_sessions();

-- Then re-check active sessions
SELECT COUNT(*) AS active_after_cleanup
FROM user_sessions
WHERE last_seen > now() - interval '60 seconds';


-- 2F. Check if count_online_users function exists and works
SELECT count_online_users(now() - interval '60 seconds') AS online_count;

-- ❌ If ERROR → Function not created (migration incomplete)
-- ✅ If returns number → Function working


-- ═══════════════════════════════════════════════════════════
-- STAP 3: LOCATION PROBLEEM
-- ═══════════════════════════════════════════════════════════

-- 3A. Check which users have location data
SELECT 
  id,
  identity,
  country,
  country_code,
  city,
  latitude,
  longitude,
  timezone,
  CASE 
    WHEN country_code IS NOT NULL THEN '✅ HAS LOCATION'
    ELSE '❌ NO LOCATION'
  END AS location_status
FROM profiles
ORDER BY created_at DESC
LIMIT 10;

-- ❌ If all NULL → Location acquisition not working
-- ⚠️ If some NULL → Location only set on new logins


-- 3B. Check if YOUR profile has location
-- Replace 'YOUR_USER_ID' with your actual user ID
SELECT 
  identity,
  country,
  country_code,
  city,
  latitude,
  longitude,
  timezone,
  created_at
FROM profiles
WHERE id = 'YOUR_USER_ID';

-- ❌ All NULL → You need to logout/login or manually trigger location


-- 3C. Count how many users have location
SELECT 
  COUNT(*) AS total_users,
  COUNT(country_code) AS users_with_location,
  ROUND(COUNT(country_code)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS percentage
FROM profiles;

-- Should show: total_users, users_with_location, percentage


-- 3D. Check country distribution
SELECT 
  country,
  country_code,
  COUNT(*) AS user_count
FROM profiles
WHERE country_code IS NOT NULL
GROUP BY country, country_code
ORDER BY user_count DESC;

-- Shows which countries have users


-- ═══════════════════════════════════════════════════════════
-- STAP 4: REALTIME PUBLICATIE CHECK
-- ═══════════════════════════════════════════════════════════

-- 4A. Check which tables are in realtime publication
SELECT 
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ✅ Should include:
--    - checkins
--    - country_activity
--    - events
--    - follows
--    - live_activity
--    - profiles
--    - user_sessions


-- 4B. Check specific tables
SELECT 
  't1' AS check_order,
  'user_sessions' AS table_name,
  EXISTS (
    SELECT FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_sessions'
  ) AS in_realtime
UNION ALL
SELECT 't2', 'follows', EXISTS (
  SELECT FROM pg_publication_tables 
  WHERE pubname = 'supabase_realtime' AND tablename = 'follows'
)
UNION ALL
SELECT 't3', 'profiles', EXISTS (
  SELECT FROM pg_publication_tables 
  WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
)
UNION ALL
SELECT 't4', 'checkins', EXISTS (
  SELECT FROM pg_publication_tables 
  WHERE pubname = 'supabase_realtime' AND tablename = 'checkins'
)
ORDER BY check_order;

-- ❌ If any false → Realtime not enabled (migration issue)


-- ═══════════════════════════════════════════════════════════
-- STAP 5: FUNCTIONS CHECK
-- ═══════════════════════════════════════════════════════════

-- 5A. Check if all required functions exist
SELECT 
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS return_type,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'cleanup_stale_sessions',
    'count_online_users',
    'auto_accept_follow',
    'update_follow_counts',
    'get_friends',
    'increment_country_activity',
    'check_profanity',
    'validate_identity'
  )
ORDER BY p.proname;

-- ✅ Should show 8 functions
-- ❌ If less → Migration incomplete


-- 5B. Test get_friends function
-- Replace 'YOUR_USER_ID' with your actual user ID
SELECT * FROM get_friends('YOUR_USER_ID');

-- Returns list of friends (mutual accepted follows)


-- ═══════════════════════════════════════════════════════════
-- DIAGNOSTIC SUMMARY
-- ═══════════════════════════════════════════════════════════

-- Run this to get a quick overview
SELECT 
  '1. Tables' AS check_category,
  (SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('user_sessions', 'follows', 'rank_history', 'country_activity')
  )::text || '/4 exist' AS status
UNION ALL
SELECT 
  '2. session_id column',
  CASE WHEN EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'user_sessions' AND column_name = 'session_id'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 
  '3. Location columns',
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'profiles' 
   AND column_name IN ('country', 'country_code', 'latitude', 'longitude', 'timezone')
  )::text || '/5 exist'
UNION ALL
SELECT 
  '4. Active sessions',
  (SELECT COUNT(DISTINCT user_id) FROM user_sessions 
   WHERE last_seen > now() - interval '60 seconds'
  )::text || ' online now'
UNION ALL
SELECT 
  '5. Users with location',
  (SELECT COUNT(*) FROM profiles WHERE country_code IS NOT NULL)::text || 
  '/' || (SELECT COUNT(*) FROM profiles)::text || ' have location'
UNION ALL
SELECT 
  '6. Realtime tables',
  (SELECT COUNT(*) FROM pg_publication_tables 
   WHERE pubname = 'supabase_realtime'
  )::text || ' tables in realtime'
UNION ALL
SELECT 
  '7. Functions',
  (SELECT COUNT(*) FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public'
   AND p.proname IN ('cleanup_stale_sessions', 'count_online_users', 'get_friends')
  )::text || '/3 core functions exist';


-- ════════════════════════════════════════════════════════════
-- COMMON FIXES
-- ════════════════════════════════════════════════════════════
--
-- ❌ Problem: Tables missing
-- ✅ Fix: Run supabase_social_presence_migration.sql
--
-- ❌ Problem: No active sessions (0 online)
-- ✅ Fix: Check if usePresence() is called in frontend
--        Check browser console for errors
--        Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
--
-- ❌ Problem: Sessions exist but all STALE
-- ✅ Fix: Heartbeat not working
--        Check setInterval in usePresence.js
--        Check network tab for failed requests
--
-- ❌ Problem: No location data
-- ✅ Fix: Add ensureLocation(userId) to login flow
--        Check if geolocation permission granted
--        Deploy ip-geolocation edge function
--
-- ❌ Problem: Realtime not working
-- ✅ Fix: Tables not in publication
--        Re-run migration DO blocks
--
-- ════════════════════════════════════════════════════════════
