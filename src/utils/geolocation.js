/**
 * Geolocation Utility
 * 
 * Privacy-first country detection (country-level only, no precise tracking).
 * 
 * In production:
 * - Run server-side on login/session creation
 * - Use server IP detection (not client spoofable)
 * - Store in user_sessions table
 * 
 * For demo:
 * - Uses ipapi.co free tier (client-side)
 * - Falls back to default if unavailable
 */

// Country centroids (approximate center coordinates)
const COUNTRY_CENTROIDS = {
  US: { lat: 37.0902, lng: -95.7129, name: "United States" },
  GB: { lat: 55.3781, lng: -3.4360, name: "United Kingdom" },
  DE: { lat: 51.1657, lng: 10.4515, name: "Germany" },
  FR: { lat: 46.2276, lng: 2.2137, name: "France" },
  ES: { lat: 40.4637, lng: -3.7492, name: "Spain" },
  IT: { lat: 41.8719, lng: 12.5674, name: "Italy" },
  CA: { lat: 56.1304, lng: -106.3468, name: "Canada" },
  AU: { lat: -25.2744, lng: 133.7751, name: "Australia" },
  JP: { lat: 36.2048, lng: 138.2529, name: "Japan" },
  KR: { lat: 35.9078, lng: 127.7669, name: "South Korea" },
  BR: { lat: -14.2350, lng: -51.9253, name: "Brazil" },
  IN: { lat: 20.5937, lng: 78.9629, name: "India" },
  NL: { lat: 52.1326, lng: 5.2913, name: "Netherlands" },
  SE: { lat: 60.1282, lng: 18.6435, name: "Sweden" },
  CH: { lat: 46.8182, lng: 8.2275, name: "Switzerland" },
  MX: { lat: 23.6345, lng: -102.5528, name: "Mexico" },
  AR: { lat: -38.4161, lng: -63.6167, name: "Argentina" },
  PL: { lat: 51.9194, lng: 19.1451, name: "Poland" },
  BE: { lat: 50.5039, lng: 4.4699, name: "Belgium" },
  NO: { lat: 60.4720, lng: 8.4689, name: "Norway" },
};

// Country flags (emoji)
export const COUNTRY_FLAGS = {
  US: "🇺🇸", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷", ES: "🇪🇸",
  IT: "🇮🇹", CA: "🇨🇦", AU: "🇦🇺", JP: "🇯🇵", KR: "🇰🇷",
  BR: "🇧🇷", IN: "🇮🇳", NL: "🇳🇱", SE: "🇸🇪", CH: "🇨🇭",
  MX: "🇲🇽", AR: "🇦🇷", PL: "🇵🇱", BE: "🇧🇪", NO: "🇳🇴",
};

/**
 * Detect user's country via IP geolocation
 * Returns country code, name, and centroid coordinates
 */
export async function detectCountry() {
  try {
    // In production, this would be a server-side API call
    const response = await fetch("https://ipapi.co/json/", {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) throw new Error("Geolocation API failed");

    const data = await response.json();
    const countryCode = data.country_code || data.country;

    if (countryCode && COUNTRY_CENTROIDS[countryCode]) {
      const centroid = COUNTRY_CENTROIDS[countryCode];
      return {
        country_code: countryCode,
        country_name: centroid.name,
        lat: centroid.lat,
        lng: centroid.lng,
        flag: COUNTRY_FLAGS[countryCode] || "🌍",
      };
    }

    // Fallback if country not in our list
    return {
      country_code: countryCode || "US",
      country_name: data.country_name || "Unknown",
      lat: data.latitude || 37.0902,
      lng: data.longitude || -95.7129,
      flag: COUNTRY_FLAGS[countryCode] || "🌍",
    };
  } catch (error) {
    console.warn("[detectCountry] Failed to detect country, using default:", error);
    
    // Default fallback (US)
    return {
      country_code: "US",
      country_name: "United States",
      lat: 37.0902,
      lng: -95.7129,
      flag: "🇺🇸",
    };
  }
}

/**
 * Get country centroid coordinates
 */
export function getCountryCentroid(countryCode) {
  return COUNTRY_CENTROIDS[countryCode] || COUNTRY_CENTROIDS.US;
}

/**
 * Get country flag emoji
 */
export function getCountryFlag(countryCode) {
  return COUNTRY_FLAGS[countryCode] || "🌍";
}

/**
 * Get random country for demo/testing
 */
export function getRandomCountry() {
  const codes = Object.keys(COUNTRY_CENTROIDS);
  const code = codes[Math.floor(Math.random() * codes.length)];
  const centroid = COUNTRY_CENTROIDS[code];
  
  return {
    country_code: code,
    country_name: centroid.name,
    lat: centroid.lat,
    lng: centroid.lng,
    flag: COUNTRY_FLAGS[code],
  };
}
