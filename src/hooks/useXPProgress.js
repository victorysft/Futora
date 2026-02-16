import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useXPProgress — Daily XP cap tracking.
 *
 * - Track how much XP the user earned today
 * - Show progress toward the 150 XP daily cap
 * - Show if user is capped
 *
 * Returns: { xpToday, xpCap, xpRemaining, isCapped, loading }
 */
export function useXPProgress(userId) {
  const XP_CAP = 150;
  const [xpToday, setXpToday] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchXPToday = useCallback(async () => {
    if (!userId) return;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("live_activity")
        .select("meta")
        .eq("user_id", userId)
        .in("type", ["checkin", "levelup"])
        .gte("created_at", todayStart.toISOString());

      let total = 0;
      (data || []).forEach((a) => {
        const meta = typeof a.meta === "string" ? JSON.parse(a.meta) : a.meta;
        if (meta?.xp) total += Number(meta.xp) || 0;
      });

      setXpToday(total);
    } catch (err) {
      console.error("[useXPProgress] error:", err);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchXPToday().finally(() => setLoading(false));

    const channel = supabase
      .channel("xp-progress-" + userId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_activity",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchXPToday()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId, fetchXPToday]);

  return {
    xpToday,
    xpCap: XP_CAP,
    xpRemaining: Math.max(0, XP_CAP - xpToday),
    isCapped: xpToday >= XP_CAP,
    progress: Math.min(1, xpToday / XP_CAP),
    loading,
  };
}
