import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useFollowEngine — Clean follow system
 *
 * - Follow / unfollow with optimistic UI
 * - Follower & following counts
 * - Follow state: none | accepted | self
 */

export function useFollowEngine(userId) {
  const [followStates, setFollowStates] = useState(new Map());
  const [followingIds, setFollowingIds] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all follows on mount
  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    supabase
      .from("follows")
      .select("following_id, status")
      .eq("follower_id", userId)
      .then(({ data }) => {
        const ids = (data || []).filter((f) => f.status === "accepted").map((f) => f.following_id);
        setFollowingIds(ids);

        const states = new Map();
        (data || []).forEach((f) => {
          states.set(f.following_id, { status: f.status, loading: false });
        });
        setFollowStates(states);
        setLoading(false);
      });
  }, [userId]);

  const getFollowState = useCallback((targetId) => {
    if (!targetId || targetId === userId) return { status: "self", loading: false };
    return followStates.get(targetId) || { status: "none", loading: false };
  }, [followStates, userId]);

  const followUser = useCallback(async (targetId) => {
    if (!userId || !targetId || targetId === userId) return;

    // Optimistic
    setFollowStates((prev) => {
      const next = new Map(prev);
      next.set(targetId, { status: "accepted", loading: false });
      return next;
    });
    setFollowingIds((prev) => [...prev, targetId]);

    try {
      const { error } = await supabase
        .from("follows")
        .upsert({ follower_id: userId, following_id: targetId, status: "accepted" }, { onConflict: "follower_id,following_id" });

      if (error) throw error;
    } catch (err) {
      console.error("[FollowEngine] follow error:", err);
      // Rollback
      setFollowStates((prev) => {
        const next = new Map(prev);
        next.delete(targetId);
        return next;
      });
      setFollowingIds((prev) => prev.filter((id) => id !== targetId));
    }
  }, [userId]);

  const unfollowUser = useCallback(async (targetId) => {
    if (!userId || !targetId) return;

    // Optimistic
    setFollowStates((prev) => {
      const next = new Map(prev);
      next.delete(targetId);
      return next;
    });
    setFollowingIds((prev) => prev.filter((id) => id !== targetId));

    try {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", userId)
        .eq("following_id", targetId);
    } catch (err) {
      console.error("[FollowEngine] unfollow error:", err);
      // Rollback
      setFollowStates((prev) => {
        const next = new Map(prev);
        next.set(targetId, { status: "accepted", loading: false });
        return next;
      });
      setFollowingIds((prev) => [...prev, targetId]);
    }
  }, [userId]);

  // Fetch follow states for a batch of user IDs
  const fetchFollowStates = useCallback(async (targetIds) => {
    if (!userId || !targetIds.length) return;
    const { data } = await supabase
      .from("follows")
      .select("following_id, status")
      .eq("follower_id", userId)
      .in("following_id", targetIds);

    setFollowStates((prev) => {
      const next = new Map(prev);
      targetIds.forEach((tid) => {
        const match = (data || []).find((f) => f.following_id === tid);
        next.set(tid, { status: match ? match.status : "none", loading: false });
      });
      return next;
    });
  }, [userId]);

  return {
    followingIds,
    followStates,
    loading,
    getFollowState,
    followUser,
    unfollowUser,
    fetchFollowStates,
  };
}
