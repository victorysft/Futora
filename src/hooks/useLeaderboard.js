import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useLeaderboard — Real-time global leaderboard from profiles.
 *
 * - Fetches top 10 by XP on mount
 * - Subscribes to UPDATE on profiles (xp changes)
 * - Recalculates ranking on any xp change
 * - Computes "your rank" via a separate query
 *
 * Returns: { leaders: Array, myRank: number | null, loading: boolean }
 */
export function useLeaderboard(userId) {
  const [leaders, setLeaders] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, identity, becoming, xp, streak, level")
        .order("xp", { ascending: false })
        .limit(10);
      setLeaders(data || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyRank = useCallback(async () => {
    if (!userId) {
      setMyRank(null);
      return;
    }
    try {
      // Get current user's XP
      const { data: me } = await supabase
        .from("profiles")
        .select("xp")
        .eq("id", userId)
        .single();

      if (!me) {
        setMyRank(null);
        return;
      }

      // Count how many users have more XP
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("xp", me.xp);

      setMyRank((count ?? 0) + 1);
    } catch {
      setMyRank(null);
    }
  }, [userId]);

  useEffect(() => {
    fetchLeaderboard();
    fetchMyRank();

    channelRef.current = supabase
      .channel("leaderboard-profiles")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => {
          // Re-fetch leaderboard on any profile update
          fetchLeaderboard();
          fetchMyRank();
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchLeaderboard, fetchMyRank]);

  return { leaders, myRank, loading };
}
