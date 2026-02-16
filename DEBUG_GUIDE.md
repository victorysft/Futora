# 🔍 FUTORA BACKEND DIAGNOSTIC GUIDE

## 🚨 Quick Check — Run This First

Open Supabase SQL Editor en run:

```sql
-- Quick diagnostic
SELECT 
  (SELECT COUNT(*) FROM user_sessions WHERE last_seen > now() - interval '60 seconds') AS online_now,
  (SELECT COUNT(*) FROM profiles WHERE country_code IS NOT NULL) AS users_with_location,
  (SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'session_id')) AS has_session_id;
```

**Expected:**
- `online_now`: > 0 (als jij ingelogd bent)
- `users_with_location`: > 0 (als je ooit locatie hebt geaccepteerd)
- `has_session_id`: `true`

**If any fails** → Read below

---

## 📋 Stap 1: Tables Check

```sql
-- Run this
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('user_sessions', 'follows', 'rank_history', 'country_activity')
ORDER BY tablename;
```

**Should show 4 rows:**
- country_activity
- follows
- rank_history
- user_sessions

**❌ Missing tables?**
→ Run `supabase_social_presence_migration.sql` in SQL Editor

---

## 📋 Stap 2: Presence Debug (0 Online Issue)

### A. Check if sessions exist AT ALL

```sql
SELECT COUNT(*) FROM user_sessions;
```

**If 0:**
- Frontend `usePresence()` niet aangeroepen
- Check console errors
- Verify `.env` has correct Supabase URL/key

### B. Check if sessions are ACTIVE

```sql
SELECT 
  user_id,
  session_id,
  last_seen,
  now() - last_seen AS age
FROM user_sessions
ORDER BY last_seen DESC
LIMIT 5;
```

**What to look for:**

✅ **Good**: `age` < 60 seconds
❌ **Bad**: `age` > 60 seconds (stale sessions → heartbeat kapot)
❌ **Bad**: No rows (presence niet working)

### C. Get CORRECT online count

```sql
SELECT COUNT(DISTINCT user_id) 
FROM user_sessions
WHERE last_seen > now() - interval '60 seconds';
```

This is what frontend SHOULD show.

**If this shows 0 but you're logged in:**

1. Check browser console for errors
2. Check Network tab for `/rest/v1/user_sessions` requests
3. Verify `usePresence(userId)` is called with valid userId

### D. Check YOUR session

Get your user ID from:
- Supabase Dashboard → Authentication → Users
- Or: `SELECT auth.uid();` in SQL Editor (when logged in via frontend)

```sql
-- Replace with your actual UUID
SELECT * FROM user_sessions WHERE user_id = '00000000-0000-0000-0000-000000000000';
```

**If no row:**
- Your session is not being created
- Check if `usePresence()` is called in your app
- Check browser console errors

**If row exists but `last_seen` is old:**
- Heartbeat not working
- Check setInterval in usePresence.js
- Check network tab for failed PATCH requests

---

## 📋 Stap 3: Location Debug

### A. Check if ANY users have location

```sql
SELECT 
  identity,
  country,
  latitude,
  longitude
FROM profiles
WHERE country_code IS NOT NULL
LIMIT 5;
```

**If all NULL or 0 rows:**
- Location acquisition NEVER ran
- `ensureLocation()` not called on login
- Check if browser geolocation permission granted
- Check if edge function deployed

### B. Check YOUR location

```sql
-- Replace with your user ID
SELECT 
  identity,
  country,
  country_code,
  city,
  latitude,
  longitude
FROM profiles
WHERE id = '00000000-0000-0000-0000-000000000000';
```

**If all NULL:**

You need to trigger location acquisition:

**Option 1: Logout/Login** (if `ensureLocation()` is in login flow)

**Option 2: Manual trigger** (in browser console):

```javascript
import { acquireGeolocation } from './utils/locationAcquisition';
const user = supabase.auth.getUser();
await acquireGeolocation(user.data.user.id);
```

**Option 3: Browser permission**
- Check if you DENIED geolocation
- Try in incognito window
- Check if edge function is deployed

---

## 📋 Stap 4: Realtime Check

```sql
SELECT tablename 
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

**Must include:**
- checkins
- country_activity
- events
- follows
- live_activity
- profiles
- user_sessions

**Missing tables?**
→ Re-run migration (the DO blocks that add tables to realtime)

---

## 📋 Stap 5: Functions Check

```sql
SELECT proname 
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND proname IN ('count_online_users', 'cleanup_stale_sessions', 'get_friends');
```

**Should show 3 rows.**

**Missing?**
→ Run `supabase_social_presence_migration.sql`

---

## 🔧 Common Fixes

### Fix 1: "0 users online" (maar je bent ingelogd)

**Diagnose:**
```sql
SELECT * FROM user_sessions;
```

**If empty:**
Problem: `usePresence()` not called or broken

**Fix:**
1. Check if `usePresence(userId)` is in your Dashboard/AppShell
2. Check console errors
3. Verify `.env` file

**If has rows but all STALE (old last_seen):**
Problem: Heartbeat not working

**Fix:**
1. Check `setInterval` in `usePresence.js` line ~67
2. Check Network tab for failed PATCH requests to `/user_sessions`
3. Check RLS policies (should allow authenticated users to UPDATE own session)

---

### Fix 2: "No location data"

**Diagnose:**
```sql
SELECT COUNT(*) FROM profiles WHERE country_code IS NOT NULL;
```

**If 0:**

**Fix:**
1. Add to login flow:
```javascript
// In Auth.jsx or similar
import { ensureLocation } from './utils/locationAcquisition';

async function handleLogin(user) {
  // ... existing login code
  
  // Add this:
  await ensureLocation(user.id);
}
```

2. Or manually trigger (in browser console):
```javascript
// Get current user
const { data: { user } } = await supabase.auth.getUser();

// Acquire location
const { acquireGeolocation } = await import('./src/utils/locationAcquisition.js');
await acquireGeolocation(user.id);
```

3. Check browser geolocation permission
4. Deploy edge function: `supabase functions deploy ip-geolocation`

---

### Fix 3: "Tables missing"

**Fix:**
Run `supabase_social_presence_migration.sql` in Supabase SQL Editor

---

### Fix 4: "Realtime not working"

**Diagnose:**
```sql
SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

**Should be 7+**

**Fix:**
Re-run migration (specifically the DO blocks that add tables to realtime)

---

## 🎯 Full Diagnostic Report

Run the entire [`supabase_diagnostic.sql`](supabase_diagnostic.sql) file for complete report.

It will show:
- ✅ What's working
- ❌ What's broken
- 🔧 How to fix it

---

## 🆘 Still Stuck?

Run this and share output:

```sql
-- DIAGNOSTIC SUMMARY
SELECT 
  'Tables' AS check,
  COUNT(*)::text FROM pg_tables 
  WHERE schemaname = 'public' 
  AND table_name IN ('user_sessions', 'follows', 'rank_history')
UNION ALL
SELECT 'Active Sessions', COUNT(DISTINCT user_id)::text 
  FROM user_sessions WHERE last_seen > now() - interval '60 seconds'
UNION ALL
SELECT 'Users with Location', COUNT(*)::text 
  FROM profiles WHERE country_code IS NOT NULL
UNION ALL
SELECT 'Realtime Tables', COUNT(*)::text 
  FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
UNION ALL
SELECT 'Functions', COUNT(*)::text 
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND proname IN ('count_online_users', 'get_friends');
```

This gives a quick overview of system health.
