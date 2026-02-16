import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useTrendingFocus — Calculates trending focus areas based on check-ins today.
 *
 * Queries checkins + profiles to count active focus areas.
 *
 * Subscribes to INSERT on checkins to update realtime.
 *
 * Returns: Array<{ name, count }> sorted DESC
 */
export function useTrendingFocus() {
  const [trendingFocus, setTrendingFocus] = useState([]);
  const channelRef = useRef(null);

  const today = () => new Date().toISOString().slice(0, 10);

  const fetchTrendingFocus = useCallback(async () => {
    try {
      const todayStr = today();

      // Get all checkins today with user_id
      const { data: checkins } = await supabase
        .from("checkins")
        .select("user_id")
        .eq("date", todayStr);

      if (!checkins || checkins.length === 0) {
        setTrendingFocus([]);
        return;
      }

      const userIds = [...new Set(checkins.map((c) => c.user_id))];

      // Get profiles for these users
      const { data: profiles } = await supabase
        .from("profiles")
        .select("becoming")
        .in("id", userIds);

      // Count by focus (becoming field)
      const focusCount = new Map();
      (profiles || []).forEach((p) => {
        const focus = p.becoming || "Other";
        focusCount.set(focus, (focusCount.get(focus) || 0) + 1);
      });

      // Convert to array and sort
      const sorted = Array.from(focusCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4);

      setTrendingFocus(sorted);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchTrendingFocus();

    channelRef.current = supabase
      .channel("trending-focus-checkins")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "checkins" },
        () => {
          fetchTrendingFocus();
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchTrendingFocus]);

  return trendingFocus;
}
