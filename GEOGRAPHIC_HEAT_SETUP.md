# Geographic Heat Visualization Setup

## Overview
The Global Live Command Center now includes real-time geographic heat visualization, showing country-level activity with breathing heat spots and event-specific pulses on a 3D globe.

## Features
- **Country Heat Spots**: Breathing glow animations at country locations, intensity based on activity score
- **Activity Pulses**: Event-specific pulses (purple=checkin, gold=level_up, orange=streak)
- **Most Active Country**: Live stat showing the country with highest activity score
- **Activity Feed**: Shows "from [Country Name]" for each activity
- **Privacy-First**: Country-level only, no precise coordinates tracked

## Heat Score Formula
```
country_activity_score = online_users × 1 + checkins_today × 2 + levelups_today × 3
```

## Setup Instructions

### 1. Run Database Migration
Execute the SQL migration to add country columns to your Supabase database:

```bash
# Navigate to your project directory
cd c:\Users\voerm\Downloads\Futora

# The migration file is: supabase_geo_migration.sql
# Run it in your Supabase SQL Editor
```

**Migration adds**:
- `country_code` (TEXT) to `user_sessions` and `live_activity`
- `country_name` (TEXT) to `user_sessions` and `live_activity`
- `lat` (DECIMAL) to `user_sessions`
- `lng` (DECIMAL) to `user_sessions`
- Indexes on country columns for query performance

### 2. Update RLS Policies (if needed)
If you have Row Level Security policies on `user_sessions` or `live_activity`, ensure they allow reading the new country columns.

### 3. Geolocation Implementation Options

#### Option A: Client-Side Detection (Current Demo)
The current implementation uses `ipapi.co` for country detection:
- Free tier: 1,000 requests/day
- Good for demos and development
- Called from `src/utils/geolocation.js`

#### Option B: Server-Side Detection (Recommended for Production)
For production, implement server-side IP detection:

1. Add Edge Function to detect country from IP:
```typescript
// supabase/functions/detect-country/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  
  // Use your preferred geolocation service
  const response = await fetch(`https://ipapi.co/${ip}/json/`)
  const data = await response.json()
  
  return new Response(JSON.stringify({
    country_code: data.country_code,
    country_name: data.country_name,
  }), {
    headers: { "Content-Type": "application/json" }
  })
})
```

2. Update `src/utils/geolocation.js` to call your Edge Function instead of ipapi.co

### 4. Store Country Data on Activity Creation
Update your activity creation logic to include country data:

```javascript
// Example: When creating a check-in activity
import { detectCountry, getCountryCentroid } from '../utils/geolocation'

async function createCheckInActivity(userId) {
  const country = await detectCountry()
  const centroid = getCountryCentroid(country.country_code)
  
  await supabase.from('live_activity').insert({
    user_id: userId,
    type: 'checkin',
    country_code: country.country_code,
    country_name: country.country_name,
    // lat and lng are optional (not stored in live_activity)
  })
}
```

## Components Updated

### New Files
- `supabase_geo_migration.sql` - Database schema updates
- `src/utils/geolocation.js` - Country detection and centroids (20 countries)
- `src/hooks/useCountryHeat.js` - Real-time country heat tracking

### Modified Files
- `src/components/Globe3D.jsx` - Added CountryHeatSpot and ActivityPulse components
- `src/pages/GlobalLive.jsx` - Integrated country heat hook and UI updates
- `src/pages/GlobalLive.css` - Added styles for most active country and feed
- `src/hooks/useGlobalActivity.js` - Store and use country data in activities

## Performance Optimizations
- **Debouncing**: 1-second window for duplicate events
- **Pulse Limits**: Maximum 100 pulses in memory
- **Lifetime**: Pulses auto-removed after 5 seconds
- **Cleanup**: Periodic cleanup every 5 seconds
- **Memoization**: Components use React.memo for rendering efficiency

## Privacy Considerations
- Only country-level tracking (no city, no precise GPS)
- Uses country centroids for visualization (not user locations)
- No personal location data stored
- Compliant with GDPR/privacy regulations

## Supported Countries
Current implementation includes 20 countries:
- US, GB, DE, FR, CA, AU, JP, BR, IN, MX
- NL, ES, IT, SE, NO, DK, FI, PL, BE, CH

To add more countries, update `COUNTRY_CENTROIDS` in `src/utils/geolocation.js`

## Testing
1. Navigate to `/global` page
2. Verify heat spots appear on countries with activity
3. Check "Most Active Country" stat updates in real-time
4. Confirm activity feed shows "from [Country Name]"
5. Watch pulses trigger on new check-ins/level-ups

## Troubleshooting

### No heat spots appearing
- Check database has country_code data in user_sessions/live_activity
- Verify useCountryHeat hook is fetching data (check browser console)
- Ensure mode is set to "live" (not "heatmap")

### Most Active Country not showing
- Verify mostActiveCountry has data (check console)
- Ensure at least one country has activity score > 0
- Check CSS styles for .gl-most-active are loaded

### Country names missing in feed
- Verify live_activity rows have country_code populated
- Check getCountryFlag() is returning valid flags
- Ensure generateCountryData() is being called as fallback

## Future Enhancements
- Add more countries (currently 20, can expand to 200+)
- Implement user location preferences in profile
- Add heat map intensity levels (low/medium/high)
- Create country leaderboards by activity type
- Add animated data flows between countries
- Time-based heat intensity (show 24h trends)

## Support
For issues or questions, check:
- Browser console for errors
- Supabase logs for database issues
- Network tab for API call failures
