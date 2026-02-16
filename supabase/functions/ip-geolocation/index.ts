// Supabase Edge Function: IP Geolocation
// Fallback when browser geolocation is denied
// Deployed at: https://[project-ref].supabase.co/functions/v1/ip-geolocation

// @ts-ignore Deno types not available in VSCode
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore Deno types not available in VSCode
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get client IP from request headers
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 
                     'unknown'

    console.log('Client IP:', clientIP)

    // Use ipapi.co for geolocation (free tier: 1000 req/day)
    // Alternative: ip-api.com (free, no key needed)
    const geoResponse = await fetch(`http://ip-api.com/json/${clientIP}?fields=status,message,country,countryCode,city,lat,lon,timezone`)
    
    if (!geoResponse.ok) {
      throw new Error('Geolocation API failed')
    }

    const geoData = await geoResponse.json()

    if (geoData.status === 'fail') {
      throw new Error(geoData.message || 'Geolocation failed')
    }

    // Round coordinates for privacy (to ~11km precision)
    const roundedLat = Math.round(geoData.lat * 100) / 100
    const roundedLon = Math.round(geoData.lon * 100) / 100

    const locationData = {
      country: geoData.country || 'Unknown',
      country_code: geoData.countryCode || 'XX',
      city: geoData.city || null,
      latitude: roundedLat,
      longitude: roundedLon,
      timezone: geoData.timezone || 'UTC',
      ip: clientIP, // For debugging only
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      // @ts-ignore Deno environment
      const supabaseClient = createClient(
        // @ts-ignore Deno environment
        Deno.env.get('SUPABASE_URL') ?? '',
        // @ts-ignore Deno environment
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
          global: {
            headers: { Authorization: authHeader },
          },
        }
      )

      // Get user
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
      
      if (user && !userError) {
        // Update user profile with location
        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({
            country: locationData.country,
            country_code: locationData.country_code,
            city: locationData.city,
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            timezone: locationData.timezone,
          })
          .eq('id', user.id)

        if (updateError) {
          console.error('Profile update error:', updateError)
        } else {
          console.log('Profile updated with location:', user.id)
        }
      }
    }

    return new Response(
      JSON.stringify(locationData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Return fallback data
    return new Response(
      JSON.stringify({
        country: 'Unknown',
        country_code: 'XX',
        city: null,
        latitude: null,
        longitude: null,
        timezone: 'UTC',
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // Still return 200 to not break client
      },
    )
  }
})
