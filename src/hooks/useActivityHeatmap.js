import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useActivityHeatmap — Globe heatmap data from check-ins.
 *
 * Groups check-ins by country_code in the last 24 hours.
 * Returns data suitable for globe.gl heatmapsData layer.
 *
 * Returns: { heatmapData, loading }
 */
export function useActivityHeatmap() {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  // Country code → approximate lat/lng (subset for most common countries)
  const COUNTRY_COORDS = {
    US: { lat: 39.8, lng: -98.5 },
    GB: { lat: 55.3, lng: -3.4 },
    DE: { lat: 51.2, lng: 10.4 },
    FR: { lat: 46.2, lng: 2.2 },
    CA: { lat: 56.1, lng: -106.3 },
    AU: { lat: -25.3, lng: 133.8 },
    JP: { lat: 36.2, lng: 138.3 },
    IN: { lat: 20.6, lng: 78.9 },
    BR: { lat: -14.2, lng: -51.9 },
    NL: { lat: 52.1, lng: 5.3 },
    SE: { lat: 60.1, lng: 18.6 },
    NO: { lat: 60.5, lng: 8.5 },
    ES: { lat: 40.5, lng: -3.7 },
    IT: { lat: 41.9, lng: 12.6 },
    KR: { lat: 35.9, lng: 127.8 },
    SG: { lat: 1.4, lng: 103.8 },
    AE: { lat: 23.4, lng: 53.8 },
    ZA: { lat: -30.6, lng: 22.9 },
    MX: { lat: 23.6, lng: -102.6 },
    AR: { lat: -38.4, lng: -63.6 },
    NG: { lat: 9.1, lng: 8.7 },
    KE: { lat: -0.02, lng: 37.9 },
    EG: { lat: 26.8, lng: 30.8 },
    TR: { lat: 38.9, lng: 35.2 },
    PL: { lat: 51.9, lng: 19.1 },
    RU: { lat: 61.5, lng: 105.3 },
    CN: { lat: 35.9, lng: 104.2 },
    PH: { lat: 12.9, lng: 121.8 },
    ID: { lat: -0.8, lng: 113.9 },
    TH: { lat: 15.9, lng: 100.9 },
    VN: { lat: 14.1, lng: 108.3 },
    PK: { lat: 30.4, lng: 69.3 },
    BD: { lat: 23.7, lng: 90.4 },
    CO: { lat: 4.6, lng: -74.3 },
    CL: { lat: -35.7, lng: -71.5 },
    PE: { lat: -9.2, lng: -75.0 },
    NZ: { lat: -40.9, lng: 174.9 },
    IE: { lat: 53.1, lng: -7.7 },
    PT: { lat: 39.4, lng: -8.2 },
    AT: { lat: 47.5, lng: 14.6 },
    CH: { lat: 46.8, lng: 8.2 },
    BE: { lat: 50.5, lng: 4.5 },
    DK: { lat: 56.3, lng: 9.5 },
    FI: { lat: 61.9, lng: 25.7 },
    IL: { lat: 31.0, lng: 34.9 },
    SA: { lat: 23.9, lng: 45.1 },
    MY: { lat: 4.2, lng: 101.9 },
    TW: { lat: 23.7, lng: 121.0 },
    HK: { lat: 22.4, lng: 114.1 },
    RO: { lat: 45.9, lng: 25.0 },
    CZ: { lat: 49.8, lng: 15.5 },
    GR: { lat: 39.1, lng: 21.8 },
    UA: { lat: 48.4, lng: 31.2 },
    HU: { lat: 47.2, lng: 19.5 },
  };

  const fetchHeatmap = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from("live_activity")
        .select("country_code, country_name")
        .eq("type", "checkin")
        .gte("created_at", since)
        .not("country_code", "is", null);

      // Group by country
      const countryMap = {};
      (data || []).forEach((a) => {
        const code = a.country_code;
        if (!countryMap[code]) {
          countryMap[code] = { code, name: a.country_name, count: 0 };
        }
        countryMap[code].count++;
      });

      // Convert to heatmap points
      const maxCount = Math.max(
        1,
        ...Object.values(countryMap).map((c) => c.count)
      );

      const points = Object.values(countryMap)
        .map((c) => {
          const coords = COUNTRY_COORDS[c.code];
          if (!coords) return null;
          return {
            lat: coords.lat,
            lng: coords.lng,
            weight: c.count / maxCount,
            country: c.name || c.code,
            count: c.count,
          };
        })
        .filter(Boolean);

      setHeatmapData(points);
    } catch (err) {
      console.error("[useActivityHeatmap] error:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchHeatmap().finally(() => setLoading(false));

    // Refresh on new check-ins
    channelRef.current = supabase
      .channel("activity-heatmap")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_activity" },
        () => fetchHeatmap()
      )
      .subscribe();

    const interval = setInterval(fetchHeatmap, 60_000);

    return () => {
      clearInterval(interval);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchHeatmap]);

  return { heatmapData, loading };
}
