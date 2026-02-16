import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useFollowing — Social following system.
 *
 * - Follow / unfollow users
 * - Get following list with profiles
 * - Get followers list
 * - Get friends online now (followed users who are online)
 * - Get following-only leaderboard
 * - Real-time activity feed of followed users
 *
 * Returns: {
 *   following, followers, friendsOnline, followingLeaderboard,
 *   followingFeed, isFollowing, follow, unfollow, loading
 * }
 */
export function useFollowing(userId) {
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friendsOnline, setFriendsOnline] = useState(0);
  const [followingLeaderboard, setFollowingLeaderboard] = useState([]);
  const [followingFeed, setFollowingFeed] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  // ── Fetch following list ──
  const fetchFollowing = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId)
        .eq("status", "accepted");

      const ids = (data || []).map((f) => f.following_id);
      setFollowingIds(new Set(ids));

      if (ids.length === 0) {
        setFollowing([]);
        setFollowingLeaderboard([]);
        setFriendsOnline(0);
        setFollowingFeed([]);
        return;
      }

      // Fetch profiles of followed users
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, identity, becoming, xp, level, streak, premium_badge, verified")
        .in("id", ids)
        .order("xp", { ascending: false });

      setFollowing(profiles || []);
      setFollowingLeaderboard(profiles || []);

      // Fetch friends online
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { count } = await supabase
        .from("user_sessions")
        .select("id", { count: "exact", head: true })
        .in("user_id", ids)
        .gte("last_seen", cutoff);

      setFriendsOnline(count || 0);

      // Fetch recent feed from followed users
      const { data: feed } = await supabase
        .from("live_activity")
        .select(`
          id, user_id, type, meta, created_at, country_code, country_name,
          profiles!live_activity_user_id_fkey (identity, becoming)
        `)
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(20);

      setFollowingFeed(
        (feed || []).map((a) => ({
          id: a.id,
          userId: a.user_id,
          type: a.type,
          meta: a.meta,
          username: a.profiles?.identity || a.profiles?.becoming || "Anonymous",
          country_code: a.country_code,
          country_name: a.country_name,
          timestamp: new Date(a.created_at),
        }))
      );
    } catch (err) {
      console.error("[useFollowing] fetch error:", err);
    }
  }, [userId]);

  // ── Fetch followers ──
  const fetchFollowers = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", userId)
        .eq("status", "accepted");

      const ids = (data || []).map((f) => f.follower_id);
      if (ids.length === 0) {
        setFollowers([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, identity, becoming, xp, level, streak")
        .in("id", ids);

      setFollowers(profiles || []);
    } catch (err) {
      console.error("[useFollowing] followers error:", err);
    }
  }, [userId]);

  // ── Follow user ──
  const follow = useCallback(
    async (targetId) => {
      if (!userId || userId === targetId) return;
      try {
        await supabase.from("follows").insert({
          follower_id: userId,
          following_id: targetId,
        });
        setFollowingIds((prev) => new Set([...prev, targetId]));
        fetchFollowing();
      } catch (err) {
        console.error("[useFollowing] follow error:", err);
      }
    },
    [userId, fetchFollowing]
  );

  // ── Unfollow user ──
  const unfollow = useCallback(
    async (targetId) => {
      if (!userId) return;
      try {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("following_id", targetId);
        setFollowingIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        fetchFollowing();
      } catch (err) {
        console.error("[useFollowing] unfollow error:", err);
      }
    },
    [userId, fetchFollowing]
  );

  // ── Fetch pending follow requests (people wanting to follow you) ──
  const fetchPendingRequests = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from("follows")
        .select("follower_id, created_at")
        .eq("following_id", userId)
        .eq("status", "pending");

      const ids = (data || []).map((f) => f.follower_id);
      if (ids.length === 0) {
        setPendingRequests([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, identity, becoming, xp, level, streak")
        .in("id", ids);

      setPendingRequests(profiles || []);
    } catch (err) {
      console.error("[useFollowing] pending requests error:", err);
    }
  }, [userId]);

  // ── Accept follow request ──
  const acceptFollowRequest = useCallback(
    async (followerId) => {
      if (!userId) return;
      try {
        await supabase
          .from("follows")
          .update({ status: "accepted" })
          .eq("follower_id", followerId)
          .eq("following_id", userId);
        fetchPendingRequests();
        fetchFollowers();
      } catch (err) {
        console.error("[useFollowing] accept error:", err);
      }
    },
    [userId, fetchPendingRequests, fetchFollowers]
  );

  // ── Decline follow request ──
  const declineFollowRequest = useCallback(
    async (followerId) => {
      if (!userId) return;
      try {
        await supabase
          .from("follows")
          .update({ status: "declined" })
          .eq("follower_id", followerId)
          .eq("following_id", userId);
        fetchPendingRequests();
      } catch (err) {
        console.error("[useFollowing] decline error:", err);
      }
    },
    [userId, fetchPendingRequests]
  );

  // ── Check if following ──
  const isFollowing = useCallback(
    (targetId) => followingIds.has(targetId),
    [followingIds]
  );

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([fetchFollowing(), fetchFollowers(), fetchPendingRequests()]).finally(() =>
      setLoading(false)
    );

    // Real-time subscription for follows table changes
    channelRef.current = supabase
      .channel("following-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows" },
        (payload) => {
          const row = payload.new || payload.old;
          if (
            row?.follower_id === userId ||
            row?.following_id === userId
          ) {
            fetchFollowing();
            fetchFollowers();
            fetchPendingRequests();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_activity" },
        (payload) => {
          // Update feed if activity is from a followed user
          if (followingIds.has(payload.new.user_id)) {
            fetchFollowing(); // Refresh feed
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, fetchFollowing, fetchFollowers, fetchPendingRequests]);

  return {
    following,
    followers,
    pendingRequests,
    friendsOnline,
    followingLeaderboard,
    followingFeed,
    followingIds,
    isFollowing,
    follow,
    unfollow,
    acceptFollowRequest,
    declineFollowRequest,
    loading,
  };
}
