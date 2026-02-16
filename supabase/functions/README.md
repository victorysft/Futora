# Supabase Edge Functions - Deployment Guide

## IP Geolocation Edge Function

Provides fallback geolocation when browser geolocation is denied.

### Prerequisites

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### Deploy

```bash
supabase functions deploy ip-geolocation
```

### Test Locally

```bash
supabase functions serve ip-geolocation
```

Then call:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/ip-geolocation' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```

### Usage in Frontend

```javascript
import { supabase } from './supabaseClient'

async function getIPLocation() {
  const { data, error } = await supabase.functions.invoke('ip-geolocation', {
    headers: {
      Authorization: `Bearer ${supabase.auth.session()?.access_token}`
    }
  })
  
  if (error) {
    console.error('Error:', error)
    return null
  }
  
  return data // { country, country_code, city, latitude, longitude, timezone }
}
```

### Geolocation Flow

1. **Browser Geolocation (Preferred)**
   - Request `navigator.geolocation.getCurrentPosition()`
   - Use Nominatim reverse geocoding to get country
   - Store in profile

2. **IP Geolocation (Fallback)**
   - Call this edge function
   - Automatically updates profile
   - Returns location data

### Privacy

- Coordinates rounded to 2 decimal places (~11km precision)
- Never stores exact address or full IP
- User can clear location in settings

### Rate Limits

- IP-API.com: 45 requests/minute (free)
- Consider upgrading or caching results

### Environment Variables

Set in Supabase Dashboard > Edge Functions > Secrets:

```bash
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_ANON_KEY=your-anon-key
```

(These are automatically available in Edge Functions)
