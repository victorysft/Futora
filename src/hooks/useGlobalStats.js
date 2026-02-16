import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

/**
 * useGlobalStats
 * 
 * Tracks real-time global statistics:
 * - Online users (user_sessions active within 30s)
 * - Check-ins today
 * - Level-ups today
 * - Active events
 * 
 * All values are real-time with Supabase subscriptions.
 */
export function useGlobalStats() {
  const [stats, setStats] = useState({
    onlineNow: 0,
    checkInsToday: 0,
    levelUpsToday: 0,
    activeEvents: 0,
  });

  useEffect(() => {
    let mounted = true;

    // ─── Fetch initial data ───
    async function fetchStats() {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayISO = todayStart.toISOString();
        const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000).toISOString();

        // Online now: sessions active within last 30s
        const { count: onlineCount } = await supabase
          .from("user_sessions")
          .select("*", { count: "exact", head: true })
          .gte("last_seen", thirtySecondsAgo);

        // Check-ins today: from live_activity
        const { count: checkInCount } = await supabase
          .from("live_activity")
          .select("*", { count: "exact", head: true })
          .eq("type", "checkin")
          .gte("created_at", todayISO);

        // Level-ups today: from live_activity
        const { count: levelUpCount } = await supabase
          .from("live_activity")
          .select("*", { count: "exact", head: true })
          .eq("type", "level_up")
          .gte("created_at", todayISO);

        // Active events: from events table where status != completed
        const { count: eventsCount } = await supabase
          .from("events")
          .select("*", { count: "exact", head: true })
          .neq("status", "completed");

        if (!mounted) return;

        setStats({
          onlineNow: onlineCount || 0,
          checkInsToday: checkInCount || 0,
          levelUpsToday: levelUpCount || 0,
          activeEvents: eventsCount || 0,
        });
      } catch (error) {
        console.error("[useGlobalStats] Fetch error:", error);
      }
    }

    fetchStats();

    // ─── Realtime subscriptions ───
    
    // Subscribe to user_sessions for online count
    const sessionsChannel = supabase
      .channel("global-stats-sessions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_sessions",
        },
        () => {
          // Refetch online count on any session change
          fetchOnlineCount();
        }
      )
      .subscribe();

    // Subscribe to live_activity for check-ins and level-ups
    const activityChannel = supabase
      .channel("global-stats-activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_activity",
        },
        (payload) => {
          if (!mounted) return;
          const type = payload.new.type;
          
          if (type === "checkin") {
            setStats((prev) => ({ ...prev, checkInsToday: prev.checkInsToday + 1 }));
          } else if (type === "level_up") {
            setStats((prev) => ({ ...prev, levelUpsToday: prev.levelUpsToday + 1 }));
          }
        }
      )
      .subscribe();

    // Subscribe to events for active events count
    const eventsChannel = supabase
      .channel("global-stats-events")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
        },
        () => {
          // Refetch events count on any event change
          fetchEventsCount();
        }
      )
      .subscribe();

    // Helper to refetch online count
    async function fetchOnlineCount() {
      try {
        const now = new Date();
        const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000).toISOString();
        
        const { count } = await supabase
          .from("user_sessions")
          .select("*", { count: "exact", head: true })
          .gte("last_seen", thirtySecondsAgo);

        if (mounted) {
          setStats((prev) => ({ ...prev, onlineNow: count || 0 }));
        }
      } catch (error) {
        console.error("[useGlobalStats] Online count error:", error);
      }
    }

    // Helper to refetch events count
    async function fetchEventsCount() {
      try {
        const { count } = await supabase
          .from("events")
          .select("*", { count: "exact", head: true })
          .neq("status", "completed");

        if (mounted) {
          setStats((prev) => ({ ...prev, activeEvents: count || 0 }));
        }
      } catch (error) {
        console.error("[useGlobalStats] Events count error:", error);
      }
    }

    // Cleanup
    return () => {
      mounted = false;
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(activityChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, []);

  return stats;
}
