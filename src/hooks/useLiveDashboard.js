import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useLiveDashboard — Real-time dashboard counters.
 *
 * All values are real database queries, updated via realtime subscriptions.
 *
 * Returns:
 *  - onlineUsers:       from user_sessions (last_seen < 30s ago)
 *  - checkinsToday:     from checkins where date = today
 *  - activeEvents:      from events where date >= now
 *  - levelUpsToday:     from live_activity where type = 'levelup' and today
 *
 *  All updated instantly via postgres_changes subscriptions.
 */
export function useLiveDashboard() {
  const [counters, setCounters] = useState({
    onlineUsers: 0,
    checkinsToday: 0,
    activeEvents: 0,
    levelUpsToday: 0,
  });

  const channelsRef = useRef([]);

  const today = () => new Date().toISOString().slice(0, 10);

  /* ── Fetch all counters ── */
  const fetchCounters = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - 30_000).toISOString();
      const todayStr = today();
      const nowIso = new Date().toISOString();
      const todayStart = todayStr + "T00:00:00.000Z";

      const [onlineRes, checkinsRes, eventsRes, levelupsRes] =
        await Promise.all([
          supabase
            .from("user_sessions")
            .select("id", { count: "exact", head: true })
            .gte("last_seen", cutoff),
          supabase
            .from("checkins")
            .select("id", { count: "exact", head: true })
            .eq("date", todayStr),
          supabase
            .from("events")
            .select("id", { count: "exact", head: true })
            .gte("date", nowIso),
          supabase
            .from("live_activity")
            .select("id", { count: "exact", head: true })
            .eq("type", "levelup")
            .gte("created_at", todayStart),
        ]);

      setCounters({
        onlineUsers: onlineRes.count ?? 0,
        checkinsToday: checkinsRes.count ?? 0,
        activeEvents: eventsRes.count ?? 0,
        levelUpsToday: levelupsRes.count ?? 0,
      });
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchCounters();

    // Subscribe to all relevant tables
    const ch1 = supabase
      .channel("live-dash-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_sessions" }, fetchCounters)
      .subscribe();

    const ch2 = supabase
      .channel("live-dash-checkins")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins" }, fetchCounters)
      .subscribe();

    const ch3 = supabase
      .channel("live-dash-events")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, fetchCounters)
      .subscribe();

    const ch4 = supabase
      .channel("live-dash-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_activity" }, fetchCounters)
      .subscribe();

    channelsRef.current = [ch1, ch2, ch3, ch4];

    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [fetchCounters]);

  return counters;
}
