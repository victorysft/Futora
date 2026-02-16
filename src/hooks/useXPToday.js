import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useXPToday — Tracks XP gained today per user (realtime).
 *
 * Queries live_activity table for type='checkin' records today,
 * sums xp_gained from meta.
 *
 * Subscribes to INSERT on live_activity to update in realtime.
 *
 * Returns: Map<userId, xpToday>
 */
export function useXPToday() {
  const [xpTodayMap, setXpTodayMap] = useState(new Map());
  const channelRef = useRef(null);

  const today = () => new Date().toISOString().slice(0, 10);

  const fetchXPToday = useCallback(async () => {
    try {
      const todayStart = today() + "T00:00:00.000Z";
      const { data } = await supabase
        .from("live_activity")
        .select("user_id, meta")
        .eq("type", "checkin")
        .gte("created_at", todayStart);

      const map = new Map();
      (data || []).forEach((record) => {
        const userId = record.user_id;
        const xpGained = record.meta?.xp_gained || 0;
        map.set(userId, (map.get(userId) || 0) + xpGained);
      });

      setXpTodayMap(map);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchXPToday();

    channelRef.current = supabase
      .channel("xp-today-activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_activity" },
        (payload) => {
          if (payload.new.type === "checkin") {
            const userId = payload.new.user_id;
            const xpGained = payload.new.meta?.xp_gained || 0;
            setXpTodayMap((prev) => {
              const newMap = new Map(prev);
              newMap.set(userId, (newMap.get(userId) || 0) + xpGained);
              return newMap;
            });
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchXPToday]);

  return xpTodayMap;
}
