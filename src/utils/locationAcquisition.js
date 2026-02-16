import { supabase } from "../supabaseClient";

/**
 * Geolocation Acquisition Utility
 * 
 * Flow:
 * 1. Try browser geolocation (most accurate, requires permission)
 * 2. If denied, fallback to IP-based geolocation via edge function
 * 3. Round coordinates for privacy (to ~11km precision)
 * 4. Update user profile with location data
 */

/**
 * Request browser geolocation (preferred method)
 * @returns Promise<{ latitude, longitude, accuracy } | null>
 */
export async function getBrowserGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn("[Geolocation] Browser geolocation not supported");
      resolve(null);
      return;
    }

    const options = {
      enableHighAccuracy: false, // Don't need GPS precision
      timeout: 10000,
      maximumAge: 300000, // Cache for 5 minutes
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.warn("[Geolocation] Browser geolocation denied:", error.message);
        resolve(null);
      },
      options
    );
  });
}

/**
 * Reverse geocode coordinates to get country data
 * Uses Nominatim (OpenStreetMap)
 * @param {number} lat 
 * @param {number} lng 
 * @returns Promise<{ country, country_code, city } | null>
 */
export async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=5&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'Futora/1.0 (contact@futora.app)', // Required by Nominatim
        },
      }
    );

    if (!response.ok) {
      throw new Error('Reverse geocoding failed');
    }

    const data = await response.json();
    
    return {
      country: data.address?.country || null,
      country_code: data.address?.country_code?.toUpperCase() || null,
      city: data.address?.city || data.address?.town || data.address?.village || null,
    };
  } catch (error) {
    console.error('[Geolocation] Reverse geocoding error:', error);
    return null;
  }
}

/**
 * Get IP-based geolocation from Supabase Edge Function (fallback)
 * @returns Promise<{ country, country_code, city, latitude, longitude, timezone } | null>
 */
export async function getIPGeolocation() {
  try {
    const { data, error } = await supabase.functions.invoke('ip-geolocation');
    
    if (error) {
      console.error('[Geolocation] Edge function error:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('[Geolocation] IP geolocation failed:', error);
    return null;
  }
}

/**
 * Round coordinates for privacy
 * Reduces precision to ~11km
 * @param {number} lat 
 * @param {number} lng 
 * @returns {{ latitude: number, longitude: number }}
 */
export function roundCoordinates(lat, lng) {
  return {
    latitude: Math.round(lat * 100) / 100,
    longitude: Math.round(lng * 100) / 100,
  };
}

/**
 * Update user profile with location data
 * @param {string} userId 
 * @param {object} location 
 * @returns Promise<boolean>
 */
export async function updateUserLocation(userId, location) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        country: location.country,
        country_code: location.country_code,
        city: location.city || null,
        latitude: location.latitude || null,
        longitude: location.longitude || null,
        timezone: location.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .eq('id', userId);

    if (error) {
      console.error('[Geolocation] Profile update error:', error);
      return false;
    }

    console.log('[Geolocation] Profile updated with location');
    return true;
  } catch (error) {
    console.error('[Geolocation] Update failed:', error);
    return false;
  }
}

/**
 * Full geolocation acquisition flow
 * Tries browser geolocation first, falls back to IP
 * @param {string} userId 
 * @returns Promise<{ country, country_code, city, latitude, longitude } | null>
 */
export async function acquireGeolocation(userId) {
  console.log('[Geolocation] Starting acquisition flow...');

  // Step 1: Try browser geolocation
  const browserLoc = await getBrowserGeolocation();
  
  if (browserLoc) {
    console.log('[Geolocation] Browser geolocation acquired');
    
    // Round coordinates for privacy
    const rounded = roundCoordinates(browserLoc.latitude, browserLoc.longitude);
    
    // Reverse geocode to get country/city
    const geocoded = await reverseGeocode(browserLoc.latitude, browserLoc.longitude);
    
    if (geocoded && geocoded.country_code) {
      const location = {
        ...geocoded,
        ...rounded,
      };
      
      // Update profile
      await updateUserLocation(userId, location);
      
      return location;
    }
  }

  // Step 2: Fallback to IP geolocation
  console.log('[Geolocation] Falling back to IP geolocation...');
  const ipLoc = await getIPGeolocation();
  
  if (ipLoc && ipLoc.country_code) {
    console.log('[Geolocation] IP geolocation acquired');
    
    // Edge function already updates profile
    return ipLoc;
  }

  console.warn('[Geolocation] All methods failed');
  return null;
}

/**
 * Check if user has location data
 * @param {string} userId 
 * @returns Promise<boolean>
 */
export async function hasLocation(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('country_code')
      .eq('id', userId)
      .single();

    if (error) return false;
    
    return !!data.country_code;
  } catch {
    return false;
  }
}

/**
 * Trigger location acquisition if needed
 * Call this on login/onboarding
 * @param {string} userId 
 * @returns Promise<void>
 */
export async function ensureLocation(userId) {
  const hasLoc = await hasLocation(userId);
  
  if (!hasLoc) {
    console.log('[Geolocation] No location found, acquiring...');
    await acquireGeolocation(userId);
  } else {
    console.log('[Geolocation] Location already set');
  }
}
