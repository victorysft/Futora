# FUTORA — SOCIAL + PRESENCE + LOCATION REBUILD

## ⚡ Production-Level Architecture Complete

This rebuild implements enterprise-grade social features, presence tracking, location services, privacy controls, and friend system.

---

## 📦 What's Included

### ✅ Database Migration
- **File**: `supabase_social_presence_migration.sql`
- **Run this in Supabase SQL Editor FIRST**

### ✅ Core Systems

1. **Presence System** — Multi-tab support, accurate online counting
2. **Location Tracking** — Browser + IP fallback, privacy-first
3. **Heatmap Engine** — Country activity aggregation (Live & Heatmap modes)
4. **Social Layer** — Follow requests, privacy controls, friends
5. **Security** — RLS policies, profanity filter, self-follow prevention

---

## 🚀 QUICK START

### Step 1: Run Database Migration

```bash
# In Supabase SQL Editor, run:
supabase_social_presence_migration.sql
```

**What it does:**
- Adds `session_id` to `user_sessions` (multi-tab support)
- Adds location columns to `profiles` (country, city, lat, lng, timezone)
- Adds `is_private` to `profiles` (privacy control)
- Adds `status` to `follows` (pending/accepted/declined)
- Creates `country_activity` table (heatmap data)
- Creates `profanity_filter` table
- Creates functions: `get_friends()`, `increment_country_activity()`, `count_online_users()`
- Updates RLS policies

### Step 2: Deploy Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy
supabase functions deploy ip-geolocation
```

### Step 3: Integration Points

Update your app to use the new system:

---

## 🔧 INTEGRATION GUIDE

### 1. Presence System (Multi-Tab Support)

**Updated Hook**: `src/hooks/usePresence.js`

```javascript
const { onlineCount, sessionId } = usePresence(userId);
```

**Changes:**
- ✓ Each tab creates unique `session_id`
- ✓ Heartbeat every 20 seconds
- ✓ Cleanup after 60 seconds
- ✓ `COUNT(DISTINCT user_id)` for accurate online count
- ✓ Always includes current user

**Implementation:**
```javascript
// In Dashboard or AppShell
import { usePresence } from './hooks/usePresence';

function Dashboard() {
  const { user } = useAuth();
  const { onlineCount, sessionId } = usePresence(user?.id);
  
  return (
    <div>
      <p>{onlineCount} users online</p>
    </div>
  );
}
```

---

### 2. Location Tracking (Privacy-First)

**New Utility**: `src/utils/locationAcquisition.js`

**Flow:**
1. Request browser geolocation (preferred)
2. If denied → fallback to IP geolocation (edge function)
3. Round coordinates to ~11km precision
4. Update profile automatically

**Implementation:**

```javascript
// In Auth.jsx or Onboarding.jsx
import { ensureLocation } from '../utils/locationAcquisition';

// After successful login/signup
async function handleLoginSuccess(user) {
  // Acquire location in background
  ensureLocation(user.id).catch(console.error);
}
```

**Manual Acquisition:**

```javascript
import { acquireGeolocation } from '../utils/locationAcquisition';

// In Profile settings or onboarding
async function updateLocation() {
  const location = await acquireGeolocation(userId);
  
  if (location) {
    console.log('Location updated:', location);
    // { country, country_code, city, latitude, longitude }
  }
}
```

**What Gets Stored:**
- ✓ `country` (e.g., "United States")
- ✓ `country_code` (e.g., "US")
- ✓ `city` (e.g., "San Francisco")
- ✓ `latitude` (rounded to 2 decimals)
- ✓ `longitude` (rounded to 2 decimals)
- ✓ `timezone` (e.g., "America/Los_Angeles")
- ✗ **Never** stores exact address or full IP

---

### 3. Heatmap System (Live vs Heatmap Mode)

**Updated Hook**: `src/hooks/useCountryHeat.js`

**Two Modes:**

#### Heatmap Mode (Default)
Shows today's aggregated activity per country:
- Check-ins today
- Level-ups today
- Active users today

```javascript
const { countryHeat, mostActiveCountry } = useCountryHeat("heatmap");
```

**Score Formula:**
```
score = (checkins × 2) + (levelups × 3) + (active_users × 1)
```

#### Live Mode
Shows real-time online presence with activity pulses:

```javascript
const { countryHeat, mostActiveCountry, activityPulses } = useCountryHeat("live");
```

**Usage:**

```javascript
// In Globe3D.jsx
import { useCountryHeat } from '../hooks/useCountryHeat';
import { useState } from 'react';

function Globe3D() {
  const [mode, setMode] = useState('heatmap'); // or 'live'
  const { countryHeat, mostActiveCountry, activityPulses } = useCountryHeat(mode);
  
  return (
    <div>
      <button onClick={() => setMode(mode === 'live' ? 'heatmap' : 'live')}>
        Switch to {mode === 'live' ? 'Heatmap' : 'Live'} Mode
      </button>
      
      {/* Render globe with countryHeat data */}
      {mode === 'live' && activityPulses.map(pulse => (
        <Pulse key={pulse.id} {...pulse} />
      ))}
    </div>
  );
}
```

---

### 4. Follow System (Requests + Privacy)

**New Status Field**: `follows.status`
- `"pending"` — Waiting for acceptance (if profile is private)
- `"accepted"` — Follow approved
- `"declined"` — Follow rejected

**Auto-Accept Logic:**
- Public profiles (`is_private = false`) → Auto-accept
- Private profiles (`is_private = true`) → Pending until accepted

**Follow a User:**

```javascript
import { supabase } from './supabaseClient';

async function followUser(targetUserId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_private')
    .eq('id', targetUserId)
    .single();
  
  const { error } = await supabase
    .from('follows')
    .insert({
      follower_id: currentUserId,
      following_id: targetUserId,
      // Status auto-set by trigger:
      // is_private = false → status = 'accepted'
      // is_private = true → status = 'pending'
    });
  
  if (!error) {
    console.log('Follow request sent!');
  }
}
```

**Accept Follow Request:**

```javascript
async function acceptFollowRequest(followId) {
  const { error } = await supabase
    .from('follows')
    .update({ status: 'accepted' })
    .eq('id', followId)
    .eq('following_id', currentUserId); // Security: only target can accept
  
  if (!error) {
    console.log('Follow request accepted!');
  }
}
```

**Decline Follow Request:**

```javascript
async function declineFollowRequest(followId) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('id', followId)
    .eq('following_id', currentUserId);
}
```

**Get Pending Requests:**

```javascript
const { data: requests } = await supabase
  .from('follows')
  .select(`
    id,
    created_at,
    follower:follower_id (id, identity, level, xp)
  `)
  .eq('following_id', currentUserId)
  .eq('status', 'pending');
```

---

### 5. Friend System (Mutual Follows)

**Definition**: Users are friends if they have **mutual accepted follows**.

**Get Friends (Using RPC):**

```javascript
const { data: friends } = await supabase
  .rpc('get_friends', { user_uuid: currentUserId });

// Returns:
// [
//   {
//     friend_id: 'uuid',
//     username: 'Alice',
//     identity: 'Entrepreneur',
//     level: 12,
//     xp: 5400,
//     is_online: true
//   },
//   ...
// ]
```

**Friends Online Component:**

```javascript
function FriendsOnline() {
  const [friends, setFriends] = useState([]);
  const { user } = useAuth();
  
  useEffect(() => {
    async function fetchFriends() {
      const { data } = await supabase.rpc('get_friends', { 
        user_uuid: user.id 
      });
      setFriends(data || []);
    }
    
    fetchFriends();
    
    // Subscribe to changes
    const channel = supabase
      .channel('friends-online')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'follows' },
        fetchFriends
      )
      .subscribe();
    
    return () => supabase.removeChannel(channel);
  }, [user.id]);
  
  const onlineFriends = friends.filter(f => f.is_online);
  
  return (
    <div>
      <h3>Friends Online ({onlineFriends.length})</h3>
      {onlineFriends.map(friend => (
        <div key={friend.friend_id}>
          <span>🟢</span> {friend.username} · Lv{friend.level}
        </div>
      ))}
    </div>
  );
}
```

---

### 6. Privacy Controls

**Toggle Profile Privacy:**

```javascript
async function togglePrivacy(isPrivate) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_private: isPrivate })
    .eq('id', currentUserId);
  
  if (!error) {
    console.log(`Profile is now ${isPrivate ? 'private' : 'public'}`);
  }
}
```

**Profile Visibility:**
- **Public** (`is_private = false`):
  - Anyone can see full profile
  - Follows auto-accepted
  - Appears in discover/leaderboard
  
- **Private** (`is_private = true`):
  - Only accepted followers see full profile
  - Follows require acceptance
  - Limited visibility in public feeds

**Implementation in Profile.jsx:**

```javascript
function ProfileSettings() {
  const [isPrivate, setIsPrivate] = useState(false);
  
  async function handlePrivacyToggle(value) {
    await togglePrivacy(value);
    setIsPrivate(value);
  }
  
  return (
    <div>
      <label>
        <input 
          type="checkbox" 
          checked={isPrivate}
          onChange={(e) => handlePrivacyToggle(e.target.checked)}
        />
        Private Profile
      </label>
      <p>
        {isPrivate 
          ? "Only accepted followers can see your full profile"
          : "Your profile is visible to everyone"
        }
      </p>
    </div>
  );
}
```

---

### 7. Profanity Filter

**New Utility**: `src/utils/profanityFilter.js`

**Client-Side Validation:**

```javascript
import { validateIdentity, validateField } from '../utils/profanityFilter';

// In form inputs
function IdentityInput() {
  const [identity, setIdentity] = useState('');
  const [error, setError] = useState(null);
  
  function handleChange(value) {
    setIdentity(value);
    const validation = validateIdentity(value);
    setError(validation.error);
  }
  
  return (
    <div>
      <input 
        value={identity}
        onChange={(e) => handleChange(e.target.value)}
      />
      {error && <span className="error">{error}</span>}
    </div>
  );
}
```

**Backend Protection:**
- Database trigger validates `identity` onINSERT/UPDATE
- Raises exception if profanity detected
- Prevents storing inappropriate content

---

### 8. Network Page (Complete Implementation)

**Required Tabs:**
1. **Discover** — Browse users (public profiles)
2. **Following** — Users you follow (accepted)
3. **Followers** — Users following you (accepted)
4. **Requests** — Pending follow requests (if private profile)

**Example Implementation:**

```javascript
function Network() {
  const [tab, setTab] = useState('discover');
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  
  useEffect(() => {
    async function fetchProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('is_private')
        .eq('id', user.id)
        .single();
      setProfile(data);
    }
    fetchProfile();
  }, [user.id]);
  
  return (
    <div>
      <nav>
        <button onClick={() => setTab('discover')}>Discover</button>
        <button onClick={() => setTab('following')}>Following</button>
        <button onClick={() => setTab('followers')}>Followers</button>
        {profile?.is_private && (
          <button onClick={() => setTab('requests')}>
            Requests {/* Show badge if pending > 0 */}
          </button>
        )}
      </nav>
      
      {tab === 'discover' && <DiscoverTab />}
      {tab === 'following' && <FollowingTab />}
      {tab === 'followers' && <FollowersTab />}
      {tab === 'requests' && <RequestsTab />}
    </div>
  );
}
```

---

## 📊 Database Schema Changes

### `user_sessions`
```sql
id              uuid
user_id         uuid (FK → auth.users)
session_id      text UNIQUE  -- NEW: Per-tab identification
last_seen       timestamptz
created_at      timestamptz
```

### `profiles`
```sql
-- Existing columns...
country         text          -- NEW: "United States"
country_code    text          -- NEW: "US"
city            text          -- NEW: "San Francisco"
latitude        numeric(8,5)  -- NEW: Rounded (e.g., 37.77)
longitude       numeric(8,5)  -- NEW: Rounded (e.g., -122.42)
timezone        text          -- NEW: "America/Los_Angeles"
is_private      boolean       -- NEW: Privacy control
```

### `follows`
```sql
id              uuid
follower_id     uuid (FK → auth.users)
following_id    uuid (FK → auth.users)
status          text  -- NEW: 'pending' | 'accepted' | 'declined'
created_at      timestamptz
```

### `country_activity` (NEW TABLE)
```sql
id              uuid
country_code    text
country_name    text
date            date (UNIQUE with country_code)
checkins_count  integer
levelups_count  integer
active_users    integer
created_at      timestamptz
updated_at      timestamptz
```

---

## 🔒 Security Features

### RLS Policies

1. **Profiles** — Private profiles only visible to accepted followers
2. **Follows** — Users can update follow requests to them (accept/decline)
3. **User Sessions** — Public read, own session write
4. **Country Activity** — Public read

### Constraints

- ✓ Prevent self-follow (`follower_id != following_id`)
- ✓ Unique follow pairs (no duplicates)
- ✓ Profanity filter on identity
- ✓ Status validation ('pending' | 'accepted' | 'declined')

---

## 🎯 Next Steps (Frontend Implementation)

### Priority 1: Core Integration
- [ ] Add `ensureLocation()` to login/signup flow
- [ ] Update Globe3D with mode toggle (Live/Heatmap)
- [ ] Add privacy toggle in Profile page

### Priority 2: Social Features
- [ ] Implement follow/unfollow buttons
- [ ] Add follow requests UI (accept/decline)
- [ ] Create Friends Online panel
- [ ] Update Network page with all tabs

### Priority 3: Polish
- [ ] Add profanity validation to all text inputs
- [ ] Show friend badge on user cards
- [ ] Add location permission prompt UI
- [ ] Display heatmap legend

---

## 🐛 Troubleshooting

### "Function count_online_users does not exist"
Run the migration SQL file again.

### "IP geolocation returns 'Unknown'"
1. Check edge function is deployed: `supabase functions list`
2. Check function logs: `supabase functions logs ip-geolocation`
3. Verify environment variables are set in Supabase Dashboard

### "Browser geolocation denied"
This is expected behavior. The system automatically falls back to IP geolocation.

### "Profanity filter too strict"
Edit `profanity_filter` table in Supabase to customize words.

---

## 📈 Performance Notes

- **Online Count**: Uses efficient `COUNT(DISTINCT user_id)` query
- **Heatmap**: Pre-aggregated daily data in `country_activity` table
- **Location**: Cached in profile, no repeated API calls
- **Realtime**: Subscriptions optimized with debouncing

---

## 🎉 You're Ready!

All core systems are implemented. Focus on wiring up the UI components to use these hooks and utilities.

**Need Help?**
- Check the SQL migration comments
- Review hook JSDoc comments
- Test edge function locally first
- Use the verification queries in the migration file

**Good luck building! 🚀**
