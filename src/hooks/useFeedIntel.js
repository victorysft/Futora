import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useFeedIntel — Right Intelligence Panel data
 *
 * Provides:
 *  1. Suggested Users (high-discipline, not yet followed)
 *  2. Trending Communities (top by member count)
 *  3. Discipline Leaderboard (top 5 XP earners today)
 */

export function useFeedIntel(userId, followingIds = []) {
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [trendingCommunities, setTrendingCommunities] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const didFetchRef = useRef(false);

  const fetchIntel = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);

    try {
      const excludeIds = [userId, ...(followingIds || [])];

      const [usersRes, commRes, lbRes] = await Promise.all([
        // 1. Suggested Users — high streak/XP, not followed
        supabase
          .from("profiles")
          .select("id, identity, becoming, xp, level, streak, verified, badge_type, total_focus_hours")
          .not("id", "in", `(${excludeIds.join(",")})`)
          .gt("streak", 0)
          .order("xp", { ascending: false })
          .limit(5),

        // 2. Trending Communities
        supabase
          .from("communities")
          .select("id, name, slug, category, members_count, description")
          .order("members_count", { ascending: false })
          .limit(4),

        // 3. Discipline Leaderboard — top 5 by XP
        supabase
          .from("profiles")
          .select("id, identity, xp, level, streak, verified")
          .order("xp", { ascending: false })
          .limit(5),
      ]);

      setSuggestedUsers(usersRes.data || []);
      setTrendingCommunities(commRes.data || []);
      setLeaderboard(lbRes.data || []);
    } catch (err) {
      console.error("[useFeedIntel] error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, followingIds]);

  useEffect(() => {
    if (didFetchRef.current) return;
    didFetchRef.current = true;
    fetchIntel();
  }, [fetchIntel]);

  return { suggestedUsers, trendingCommunities, leaderboard, loading };
}
