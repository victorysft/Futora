import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { getRandomCountry, getCountryFlag } from "../utils/geolocation";

/**
 * useGlobalActivity
 * 
 * Subscribes to live_activity table and maintains:
 * - Recent activity feed (max 100 entries for performance)
 * - Active pulses for globe (fade after 3s but remain faint)
 * - Debounced duplicate events
 * - Country data for geographic visualization
 * 
 * Returns:
 * - activities: Array of activity objects for feed (includes country info)
 * - pulses: Array of pulse objects for globe visualization
 */

const MAX_ACTIVITIES = 100;
const PULSE_DURATION = 3000; // 3 seconds
const DEBOUNCE_WINDOW = 1000; // 1 second

// Generate country data for activity
// In production, use IP geolocation or stored user location
function generateCountryData() {
  const country = getRandomCountry();
  return {
    lat: country.lat,
    lng: country.lng,
    country_code: country.country_code,
    country_name: country.country_name,
    flag: country.flag,
  };
}

// Get pulse color based on activity type
function getPulseColor(type) {
  switch (type) {
    case "checkin":
      return "#8B5CF6"; // Purple
    case "level_up":
      return "#3B82F6"; // Blue
    case "streak":
      return "#F97316"; // Orange
    default:
      return "#8B5CF6";
  }
}

// Format activity description
function formatActivity(activity, username) {
  const name = username || "Anonymous";
  
  switch (activity.type) {
    case "checkin":
      return `${name} completed a check-in`;
    case "level_up":
      const level = activity.meta?.level || "?";
      return `${name} leveled up to ${level}`;
    case "streak":
      const streak = activity.meta?.streak || "?";
      return `${name} started a ${streak}-day streak`;
    case "goal_created":
      return `${name} created a new goal`;
    case "goal_completed":
      return `${name} completed a goal`;
    default:
      return `${name} ${activity.type}`;
  }
}

export function useGlobalActivity() {
  const [activities, setActivities] = useState([]);
  const [pulses, setPulses] = useState([]);
  const recentEventsRef = useRef(new Map()); // For debouncing

  useEffect(() => {
    let mounted = true;

    // ─── Fetch recent activities ───
    async function fetchRecentActivities() {
      try {
        const { data, error } = await supabase
          .from("live_activity")
          .select(`
            *,
            profiles!live_activity_user_id_fkey (
              identity,
              becoming
            )
          `)
          .order("created_at", { ascending: false })
          .limit(30);

        if (error) throw error;
        if (!mounted) return;

        const formatted = data.map((act) => {
          // Use stored country data if available, otherwise generate random
          const countryData = act.country_code
            ? {
                country_code: act.country_code,
                country_name: act.country_name,
                flag: getCountryFlag(act.country_code),
                lat: 0, // Will be populated by country centroid in Globe3D
                lng: 0,
              }
            : generateCountryData();

          return {
            id: act.id,
            type: act.type,
            description: formatActivity(act, act.profiles?.identity || act.profiles?.becoming),
            timestamp: new Date(act.created_at),
            ...countryData,
          };
        });

        setActivities(formatted);
      } catch (error) {
        console.error("[useGlobalActivity] Fetch error:", error);
      }
    }

    fetchRecentActivities();

    // ─── Realtime subscription ───
    const channel = supabase
      .channel("global-activity-feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_activity",
        },
        async (payload) => {
          if (!mounted) return;

          const newActivity = payload.new;
          const eventKey = `${newActivity.user_id}-${newActivity.type}-${Date.now()}`;

          // Debounce: ignore if similar event within 1 second
          const now = Date.now();
          const recentSimilar = Array.from(recentEventsRef.current.entries()).find(
            ([key, time]) => {
              const [userId, type] = key.split("-");
              return (
                userId === newActivity.user_id &&
                type === newActivity.type &&
                now - time < DEBOUNCE_WINDOW
              );
            }
          );

          if (recentSimilar) {
            return; // Skip duplicate
          }

          // Track this event
          recentEventsRef.current.set(eventKey, now);

          // Cleanup old debounce entries (older than 5 seconds)
          recentEventsRef.current.forEach((time, key) => {
            if (now - time > 5000) {
              recentEventsRef.current.delete(key);
            }
          });

          // Fetch username
          let username = "Anonymous";
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("identity, becoming")
              .eq("id", newActivity.user_id)
              .single();

            if (profile) {
              username = profile.identity || profile.becoming || "Anonymous";
            }
          } catch (err) {
            // Ignore, use Anonymous
          }

          // Use stored country data if available, otherwise generate random
          const countryData = newActivity.country_code
            ? {
                country_code: newActivity.country_code,
                country_name: newActivity.country_name,
                flag: getCountryFlag(newActivity.country_code),
                lat: 0, // Will be populated by country centroid
                lng: 0,
              }
            : generateCountryData();

          const formattedActivity = {
            id: newActivity.id,
            type: newActivity.type,
            description: formatActivity(newActivity, username),
            timestamp: new Date(newActivity.created_at),
            ...countryData,
          };

          // Add to activities feed (prepend, limit to MAX_ACTIVITIES)
          setActivities((prev) => [formattedActivity, ...prev].slice(0, MAX_ACTIVITIES));

          // Add pulse to globe
          const pulse = {
            id: `pulse-${newActivity.id}`,
            lat: countryData.lat,
            lng: countryData.lng,
            color: getPulseColor(newActivity.type),
            startTime: Date.now(),
          };

          setPulses((prev) => [...prev, pulse]);

          // Remove pulse after PULSE_DURATION (but could keep faint version)
          setTimeout(() => {
            setPulses((prev) => prev.filter((p) => p.id !== pulse.id));
          }, PULSE_DURATION);
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      recentEventsRef.current.clear();
    };
  }, []);

  return { activities, pulses };
}
