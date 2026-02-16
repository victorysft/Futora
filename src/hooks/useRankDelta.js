import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useRankDelta — Competitive rank tracking.
 *
 * - Current rank among all profiles
 * - Yesterday's rank (from rank_history)
 * - Delta ("+3 positions" or "-1 position")
 * - XP distance to next rank holder
 * - Person you just passed or who just passed you
 *
 * Returns: { rank, prevRank, delta, xpToNextRank, nextPerson, loading }
 */
export function useRankDelta(userId) {
  const [rank, setRank] = useState(null);
  const [prevRank, setPrevRank] = useState(null);
  const [delta, setDelta] = useState(0);
  const [xpToNextRank, setXpToNextRank] = useState(null);
  const [nextPerson, setNextPerson] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRank = useCallback(async () => {
    if (!userId) return;

    try {
      // ── Current rank (all users ordered by XP) ──
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, identity, xp, level")
        .order("xp", { ascending: false });

      if (!allProfiles) return;

      const myIndex = allProfiles.findIndex((p) => p.id === userId);
      const currentRank = myIndex >= 0 ? myIndex + 1 : null;
      setRank(currentRank);

      // XP to next rank
      if (myIndex > 0) {
        const personAbove = allProfiles[myIndex - 1];
        const myXp = allProfiles[myIndex]?.xp || 0;
        setXpToNextRank(personAbove.xp - myXp);
        setNextPerson({
          identity: personAbove.identity,
          rank: myIndex, // their rank (1-based)
          xp: personAbove.xp,
        });
      } else {
        setXpToNextRank(0);
        setNextPerson(null);
      }

      // ── Previous rank from rank_history ──
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const { data: history } = await supabase
        .from("rank_history")
        .select("rank")
        .eq("user_id", userId)
        .gte("recorded_at", yesterday.toISOString())
        .order("recorded_at", { ascending: false })
        .limit(1);

      if (history && history.length > 0) {
        const prev = history[0].rank;
        setPrevRank(prev);
        // Positive delta = improved (moved up, rank number decreased)
        setDelta(prev - currentRank);
      } else {
        setPrevRank(null);
        setDelta(0);
      }
    } catch (err) {
      console.error("[useRankDelta] error:", err);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchRank().finally(() => setLoading(false));

    // Refresh when live_activity changes (someone checked in)
    const channel = supabase
      .channel("rank-delta")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_activity" },
        () => fetchRank()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId, fetchRank]);

  return { rank, prevRank, delta, xpToNextRank, nextPerson, loading };
}
