import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useLeaderboard — Real-time leaderboard with tab filtering.
 *
 * Tabs:
 * - "Global"     → top users by XP (all time)
 * - "This Week"  → top users by XP gained this week
 * - "Following"  → only users you follow, sorted by XP
 * - "Country"    → users from the same country as you
 *
 * Focus filter: optional string to filter by `becoming` field
 *
 * Returns: { leaders, myRank, loading, totalCount }
 */
export function useLeaderboard(userId, tab = "Global", focusFilter = "", followingIds = []) {
  const [leaders, setLeaders] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      if (tab === "Global") {
        let query = supabase
          .from("profiles")
          .select("id, identity, becoming, xp, streak, level, location, focus")
          .order("xp", { ascending: false })
          .limit(25);

        if (focusFilter) {
          query = query.ilike("becoming", `%${focusFilter}%`);
        }

        const { data } = await query;
        setLeaders(data || []);

        // Total count
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });
        setTotalCount(count || 0);

      } else if (tab === "This Week") {
        // Get XP gained this week from live_activity
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);

        const { data: activity } = await supabase
          .from("live_activity")
          .select("user_id, meta")
          .in("type", ["checkin", "levelup"])
          .gte("created_at", weekAgo.toISOString());

        // Sum XP per user from meta.xp_gained or meta.xp
        const xpMap = {};
        (activity || []).forEach((a) => {
          const meta = typeof a.meta === "string" ? JSON.parse(a.meta) : a.meta;
          const xpGain = meta?.xp_gained || meta?.xp || 0;
          xpMap[a.user_id] = (xpMap[a.user_id] || 0) + xpGain;
        });

        const userIds = Object.keys(xpMap);
        if (userIds.length === 0) {
          setLeaders([]);
          return;
        }

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, identity, becoming, xp, streak, level, location, focus")
          .in("id", userIds);

        const merged = (profiles || []).map((p) => ({
          ...p,
          weekXp: xpMap[p.id] || 0,
        }));
        merged.sort((a, b) => b.weekXp - a.weekXp);

        if (focusFilter) {
          setLeaders(merged.filter((p) => p.becoming?.toLowerCase().includes(focusFilter.toLowerCase())));
        } else {
          setLeaders(merged.slice(0, 25));
        }

      } else if (tab === "Following") {
        if (!followingIds || followingIds.length === 0) {
          setLeaders([]);
          return;
        }

        let query = supabase
          .from("profiles")
          .select("id, identity, becoming, xp, streak, level, location, focus")
          .in("id", followingIds)
          .order("xp", { ascending: false });

        if (focusFilter) {
          query = query.ilike("becoming", `%${focusFilter}%`);
        }

        const { data } = await query;
        setLeaders(data || []);

      } else if (tab === "Country") {
        // Get my location first
        if (!userId) {
          setLeaders([]);
          return;
        }

        const { data: me } = await supabase
          .from("profiles")
          .select("location")
          .eq("id", userId)
          .single();

        if (!me?.location) {
          setLeaders([]);
          return;
        }

        let query = supabase
          .from("profiles")
          .select("id, identity, becoming, xp, streak, level, location, focus")
          .eq("location", me.location)
          .order("xp", { ascending: false })
          .limit(25);

        if (focusFilter) {
          query = query.ilike("becoming", `%${focusFilter}%`);
        }

        const { data } = await query;
        setLeaders(data || []);
      }
    } catch (err) {
      console.error("[useLeaderboard] error:", err);
    } finally {
      setLoading(false);
    }
  }, [tab, focusFilter, followingIds, userId]);

  const fetchMyRank = useCallback(async () => {
    if (!userId) {
      setMyRank(null);
      return;
    }
    try {
      const { data: me } = await supabase
        .from("profiles")
        .select("xp")
        .eq("id", userId)
        .single();

      if (!me) {
        setMyRank(null);
        return;
      }

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
    setLoading(true);
    fetchLeaderboard();
    fetchMyRank();

    channelRef.current = supabase
      .channel("leaderboard-profiles")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => {
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

  return { leaders, myRank, totalCount, loading };
}
