import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { getCountryCentroid, getCountryFlag, getRandomCountry } from "../utils/geolocation";

/**
 * useCountryHeat
 * 
 * Tracks real-time activity by country and calculates heat scores.
 * 
 * Heat Score Formula:
 * country_activity_score = online_users * 1 + checkins_today * 2 + levelups_today * 3
 * 
 * Returns:
 * - countryHeat: Map<country_code, { score, online, checkins, levelups, lat, lng, name, flag }>
 * - mostActiveCountry: { code, name, flag, score }
 * - activityPulses: Array of { id, country_code, lat, lng, type, timestamp }
 */

const MAX_PULSES = 100;
const PULSE_LIFETIME = 5000; // 5 seconds

export function useCountryHeat() {
  const [countryHeat, setCountryHeat] = useState(new Map());
  const [mostActiveCountry, setMostActiveCountry] = useState(null);
  const [activityPulses, setActivityPulses] = useState([]);
  const pulseDebounceRef = useRef(new Map()); // For throttling pulses

  useEffect(() => {
    let mounted = true;

    // ─── Initial data fetch ───
    async function fetchInitialData() {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayISO = todayStart.toISOString();
        const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000).toISOString();

        // Fetch online users by country
        const { data: sessions } = await supabase
          .from("user_sessions")
          .select("country_code, country_name, lat, lng")
          .gte("last_seen", thirtySecondsAgo);

        // Fetch today's check-ins by country
        const { data: checkins } = await supabase
          .from("live_activity")
          .select("country_code")
          .eq("type", "checkin")
          .gte("created_at", todayISO);

        // Fetch today's level-ups by country
        const { data: levelups } = await supabase
          .from("live_activity")
          .select("country_code")
          .eq("type", "level_up")
          .gte("created_at", todayISO);

        if (!mounted) return;

        // Calculate heat by country
        const heatMap = new Map();

        // Count online users
        (sessions || []).forEach((session) => {
          if (!session.country_code) {
            // Fallback: assign random country for demo
            const randomCountry = getRandomCountry();
            session.country_code = randomCountry.country_code;
            session.country_name = randomCountry.country_name;
            session.lat = randomCountry.lat;
            session.lng = randomCountry.lng;
          }

          const code = session.country_code;
          if (!heatMap.has(code)) {
            const centroid = getCountryCentroid(code);
            heatMap.set(code, {
              code,
              name: session.country_name || centroid.name,
              lat: session.lat || centroid.lat,
              lng: session.lng || centroid.lng,
              flag: getCountryFlag(code),
              online: 0,
              checkins: 0,
              levelups: 0,
              score: 0,
            });
          }
          heatMap.get(code).online += 1;
        });

        // Count check-ins
        (checkins || []).forEach((activity) => {
          const code = activity.country_code || "US";
          if (heatMap.has(code)) {
            heatMap.get(code).checkins += 1;
          }
        });

        // Count level-ups
        (levelups || []).forEach((activity) => {
          const code = activity.country_code || "US";
          if (heatMap.has(code)) {
            heatMap.get(code).levelups += 1;
          }
        });

        // Calculate scores
        heatMap.forEach((data) => {
          data.score = data.online * 1 + data.checkins * 2 + data.levelups * 3;
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
        console.error("[useCountryHeat] Fetch error:", error);
      }
    }

    fetchInitialData();

    // ─── Real-time subscriptions ───

    // Subscribe to user_sessions for online count changes
    const sessionsChannel = supabase
      .channel("country-heat-sessions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_sessions",
        },
        () => {
          // Refetch on session changes
          fetchInitialData();
        }
      )
      .subscribe();

    // Subscribe to live_activity for real-time pulses
    const activityChannel = supabase
      .channel("country-heat-activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_activity",
        },
        (payload) => {
          if (!mounted) return;

          const activity = payload.new;
          const countryCode = activity.country_code || "US";
          const type = activity.type;

          // Debounce: prevent too many pulses from same country within 1 second
          const debounceKey = `${countryCode}-${type}`;
          const lastPulseTime = pulseDebounceRef.current.get(debounceKey);
          const now = Date.now();

          if (lastPulseTime && now - lastPulseTime < 1000) {
            return; // Skip this pulse
          }

          pulseDebounceRef.current.set(debounceKey, now);

          // Get country coordinates
          const centroid = getCountryCentroid(countryCode);

          // Add activity pulse
          const pulse = {
            id: `pulse-${activity.id}-${now}`,
            country_code: countryCode,
            lat: centroid.lat,
            lng: centroid.lng,
            type,
            timestamp: now,
          };

          setActivityPulses((prev) => {
            // Add new pulse, limit to MAX_PULSES
            const updated = [pulse, ...prev].slice(0, MAX_PULSES);
            return updated;
          });

          // Remove pulse after PULSE_LIFETIME
          setTimeout(() => {
            setActivityPulses((prev) => prev.filter((p) => p.id !== pulse.id));
          }, PULSE_LIFETIME);

          // Update heat scores
          setCountryHeat((prev) => {
            const updated = new Map(prev);
            
            if (!updated.has(countryCode)) {
              updated.set(countryCode, {
                code: countryCode,
                name: centroid.name,
                lat: centroid.lat,
                lng: centroid.lng,
                flag: getCountryFlag(countryCode),
                online: 0,
                checkins: 0,
                levelups: 0,
                score: 0,
              });
            }

            const data = updated.get(countryCode);
            
            if (type === "checkin") data.checkins += 1;
            if (type === "level_up") data.levelups += 1;
            
            data.score = data.online * 1 + data.checkins * 2 + data.levelups * 3;

            // Recalculate most active country
            let maxScore = 0;
            let maxCountry = null;
            updated.forEach((d) => {
              if (d.score > maxScore) {
                maxScore = d.score;
                maxCountry = d;
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

            return updated;
          });
        }
      )
      .subscribe();

    // Cleanup old debounce entries every 5 seconds
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
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(activityChannel);
      clearInterval(debounceCleanup);
      pulseDebounceRef.current.clear();
    };
  }, []);

  return { countryHeat, mostActiveCountry, activityPulses };
}
