import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { getCountryCentroid, getCountryFlag, getRandomCountry } from "../utils/geolocation";

/**
 * useCountryHeat
 * 
 * Two modes:
 * - "heatmap": Shows today's activity (checkins, levelups, active users) per country
 * - "live": Shows real-time online presence with pulses
 * 
 * Heatmap Score Formula:
 * score = checkins * 2 + levelups * 3 + active_users * 1
 * 
 * Returns:
 * - countryHeat: Map<country_code, { score, online, checkins, levelups, active_users, lat, lng, name, flag }>
 * - mostActiveCountry: { code, name, flag, score }
 * - activityPulses: Array of { id, country_code, lat, lng, type, timestamp } (live mode only)
 */

const MAX_PULSES = 100;
const PULSE_LIFETIME = 5000; // 5 seconds

export function useCountryHeat(mode = "heatmap") {
  const [countryHeat, setCountryHeat] = useState(new Map());
  const [mostActiveCountry, setMostActiveCountry] = useState(null);
  const [activityPulses, setActivityPulses] = useState([]);
  const pulseDebounceRef = useRef(new Map());

  useEffect(() => {
    let mounted = true;

    // ═══════════════════════════════════════════════════════
    // HEATMAP MODE: Today's aggregated activity per country
    // ═══════════════════════════════════════════════════════
    async function fetchHeatmapData() {
      try {
        // Fetch today's activity from country_activity table
        const { data: activities } = await supabase
          .from("country_activity")
          .select("*")
          .eq("date", new Date().toISOString().split('T')[0]);

        if (!mounted) return;

        const heatMap = new Map();

        (activities || []).forEach((activity) => {
          const code = activity.country_code;
          const centroid = getCountryCentroid(code);

          heatMap.set(code, {
            code,
            name: activity.country_name || centroid.name,
            lat: centroid.lat,
            lng: centroid.lng,
            flag: getCountryFlag(code),
            online: 0, // Not used in heatmap mode
            checkins: activity.checkins_count || 0,
            levelups: activity.levelups_count || 0,
            active_users: activity.active_users || 0,
            score: 0,
          });
        });

        // Calculate scores: checkins * 2 + levelups * 3 + active_users * 1
        heatMap.forEach((data) => {
          data.score = data.checkins * 2 + data.levelups * 3 + data.active_users * 1;
        });

        setCountryHeat(heatMap);

        // Find most active country
        let maxScore = 0;
        let maxCountry = null;
        heatMap.forEach((data) => {
          if (data.score > maxScore) {
            maxScore = data.score;
            maxCountry = data;
          }
        });
        if (maxCountry) {
          setMostActiveCountry({
            code: maxCountry.code,
            name: maxCountry.name,
            flag: maxCountry.flag,
            score: maxCountry.score,
          });
        }
      } catch (error) {
        console.error("[useCountryHeat] Heatmap fetch error:", error);
      }
    }

    // ═══════════════════════════════════════════════════════
    // LIVE MODE: Real-time online presence by country
    // ═══════════════════════════════════════════════════════
    async function fetchLiveData() {
      try {
        const cutoff = new Date(Date.now() - 60_000).toISOString();

        // Fetch online users with location
        const { data: sessions } = await supabase
          .from("user_sessions")
          .select("user_id, last_seen")
          .gte("last_seen", cutoff);

        if (!mounted) return;

        // Get unique user IDs
        const uniqueUserIds = [...new Set(sessions?.map(s => s.user_id) || [])];

        if (uniqueUserIds.length === 0) {
          setCountryHeat(new Map());
          return;
        }

        // Fetch profiles with location
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, country, country_code, latitude, longitude")
          .in("id", uniqueUserIds);

        const heatMap = new Map();

        (profiles || []).forEach((profile) => {
          let code = profile.country_code;
          let lat = profile.latitude;
          let lng = profile.longitude;
          let name = profile.country;

          // Fallback if no location
          if (!code) {
            const random = getRandomCountry();
            code = random.country_code;
            name = random.country_name;
            lat = random.lat;
            lng = random.lng;
          }

          // If coordinates missing, use centroid
          if (!lat || !lng) {
            const centroid = getCountryCentroid(code);
            lat = centroid.lat;
            lng = centroid.lng;
            name = name || centroid.name;
          }

          if (!heatMap.has(code)) {
            heatMap.set(code, {
              code,
              name,
              lat,
              lng,
              flag: getCountryFlag(code),
              online: 0,
              checkins: 0,
              levelups: 0,
              active_users: 0,
              score: 0,
            });
          }
          heatMap.get(code).online += 1;
        });

        // Calculate scores (online only for live mode)
        heatMap.forEach((data) => {
          data.score = data.online;
        });

        setCountryHeat(heatMap);

        // Find most active country
        let maxScore = 0;
        let maxCountry = null;
        heatMap.forEach((data) => {
          if (data.score > maxScore) {
            maxScore = data.score;
            maxCountry = data;
          }
        });
        if (maxCountry) {
          setMostActiveCountry({
            code: maxCountry.code,
            name: maxCountry.name,
            flag: maxCountry.flag,
            score: maxCountry.score,
          });
        }
      } catch (error) {
        console.error("[useCountryHeat] Live fetch error:", error);
      }
    }

    // ═══════════════════════════════════════════════════════
    // Initial fetch based on mode
    // ═══════════════════════════════════════════════════════
    if (mode === "heatmap") {
      fetchHeatmapData();
    } else {
      fetchLiveData();
    }

    // ═══════════════════════════════════════════════════════
    // Real-time subscriptions
    // ═══════════════════════════════════════════════════════
    let sessionsChannel = null;
    let activityChannel = null;
    let heatmapChannel = null;

    if (mode === "live") {
      // Subscribe to user_sessions for live updates
      sessionsChannel = supabase
        .channel("country-heat-sessions-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_sessions" },
          () => fetchLiveData()
        )
        .subscribe();

      // Subscribe to live_activity for pulses
      activityChannel = supabase
        .channel("country-heat-activity-live")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "live_activity" },
          (payload) => {
            if (!mounted) return;

            const activity = payload.new;
            const countryCode = activity.country_code || "US";
            const type = activity.type;

            // Debounce pulses
            const debounceKey = `${countryCode}-${type}`;
            const lastPulseTime = pulseDebounceRef.current.get(debounceKey);
            const now = Date.now();

            if (lastPulseTime && now - lastPulseTime < 1000) return;

            pulseDebounceRef.current.set(debounceKey, now);

            // Create pulse
            const centroid = getCountryCentroid(countryCode);
            const pulse = {
              id: `pulse-${activity.id}-${now}`,
              country_code: countryCode,
              lat: centroid.lat,
              lng: centroid.lng,
              type,
              timestamp: now,
            };

            setActivityPulses((prev) => [pulse, ...prev].slice(0, MAX_PULSES));

            // Remove pulse after lifetime
            setTimeout(() => {
              setActivityPulses((prev) => prev.filter((p) => p.id !== pulse.id));
            }, PULSE_LIFETIME);
          }
        )
        .subscribe();
    } else if (mode === "heatmap") {
      // Subscribe to country_activity for heatmap updates
      heatmapChannel = supabase
        .channel("country-heat-heatmap")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "country_activity" },
          () => fetchHeatmapData()
        )
        .subscribe();
    }

    // Cleanup debounce map
    const debounceCleanup = setInterval(() => {
      const now = Date.now();
      pulseDebounceRef.current.forEach((time, key) => {
        if (now - time > 5000) {
          pulseDebounceRef.current.delete(key);
        }
      });
    }, 5000);

    // Cleanup
    return () => {
      mounted = false;
      if (sessionsChannel) supabase.removeChannel(sessionsChannel);
      if (activityChannel) supabase.removeChannel(activityChannel);
      if (heatmapChannel) supabase.removeChannel(heatmapChannel);
      clearInterval(debounceCleanup);
      pulseDebounceRef.current.clear();
    };
  }, [mode]);

  return { countryHeat, mostActiveCountry, activityPulses };
}
