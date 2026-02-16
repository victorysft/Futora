import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useCountryStats — Country-based analytics.
 *
 * - Active countries right now (from user_sessions)
 * - Country leaderboard (users grouped by location, total XP per country)
 * - Top active country today (most check-ins)
 * - Filter by focus area
 *
 * Returns: { activeCountries, countryLeaderboard, topCountryToday, loading }
 */
export function useCountryStats() {
  const [activeCountries, setActiveCountries] = useState([]);
  const [countryLeaderboard, setCountryLeaderboard] = useState([]);
  const [topCountryToday, setTopCountryToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      // ── Active countries (from online sessions) ──
      const cutoff = new Date(Date.now() - 30_000).toISOString();
      const { data: sessions } = await supabase
        .from("user_sessions")
        .select("user_id, country_code, country_name")
        .gte("last_seen", cutoff);

      // Group by country
      const countryMap = {};
      (sessions || []).forEach((s) => {
        const code = s.country_code || "XX";
        const name = s.country_name || "Unknown";
        if (!countryMap[code]) {
          countryMap[code] = { code, name, activeUsers: 0 };
        }
        countryMap[code].activeUsers++;
      });

      const active = Object.values(countryMap).sort(
        (a, b) => b.activeUsers - a.activeUsers
      );
      setActiveCountries(active);

      // ── Country leaderboard (total XP per country from profiles) ──
      const { data: profiles } = await supabase
        .from("profiles")
        .select("location, xp, level, identity")
        .not("location", "is", null)
        .not("location", "eq", "");

      const countryXp = {};
      (profiles || []).forEach((p) => {
        const loc = p.location || "Unknown";
        if (!countryXp[loc]) {
          countryXp[loc] = { country: loc, totalXp: 0, builders: 0, topBuilder: null, topXp: 0 };
        }
        countryXp[loc].totalXp += p.xp || 0;
        countryXp[loc].builders++;
        if ((p.xp || 0) > countryXp[loc].topXp) {
          countryXp[loc].topXp = p.xp || 0;
          countryXp[loc].topBuilder = p.identity;
        }
      });

      const leaderboard = Object.values(countryXp).sort(
        (a, b) => b.totalXp - a.totalXp
      );
      setCountryLeaderboard(leaderboard);

      // ── Top active country today (most check-ins) ──
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayActivity } = await supabase
        .from("live_activity")
        .select("country_code, country_name")
        .eq("type", "checkin")
        .gte("created_at", todayStart.toISOString());

      const todayCountryMap = {};
      (todayActivity || []).forEach((a) => {
        const code = a.country_code || "XX";
        const name = a.country_name || "Unknown";
        if (!todayCountryMap[code]) {
          todayCountryMap[code] = { code, name, checkins: 0 };
        }
        todayCountryMap[code].checkins++;
      });

      const topToday = Object.values(todayCountryMap).sort(
        (a, b) => b.checkins - a.checkins
      )[0] || null;

      setTopCountryToday(topToday);
    } catch (err) {
      console.error("[useCountryStats] error:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));

    // Refresh every 30s and on new activity
    const interval = setInterval(fetchData, 30_000);

    channelRef.current = supabase
      .channel("country-stats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_activity" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchData]);

  return { activeCountries, countryLeaderboard, topCountryToday, loading };
}
