import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useRealtimeFeed — Live activity feed from live_activity table.
 *
 * - Fetches the newest 10 events on mount
 * - Subscribes to INSERT on live_activity via postgres_changes
 * - Auto-prepends new events (keeps max 20 in memory)
 *
 * Returns: { feed: Array<{ id, user_id, type, meta, created_at }> }
 */
export function useRealtimeFeed() {
  const [feed, setFeed] = useState([]);
  const channelRef = useRef(null);

  const fetchInitialFeed = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("live_activity")
        .select("id, user_id, type, meta, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      setFeed(data || []);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchInitialFeed();

    channelRef.current = supabase
      .channel("live-activity-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_activity" },
        (payload) => {
          setFeed((prev) => [payload.new, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchInitialFeed]);

  return { feed };
}
