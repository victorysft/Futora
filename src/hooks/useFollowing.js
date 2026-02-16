import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useFollowing — Deterministic follow state machine v2
 *
 * States:
 * - none: No follow relationship (only set after DB confirms)
 * - pending: Follow requested (target is private)
 * - accepted: Following (target is public or approved)
 * - mutual: Friends (both follow each other with accepted status)
 * - self: Viewing own profile
 *
 * Guarantees:
 * - No flicker: optimistic updates are never overwritten by stale DB reads
 * - No duplicate inserts: guard checks state before inserting
 * - Upsert with onConflict to handle unique constraint
 * - Cancel request = unfollow for pending state
 */
export function useFollowing(userId) {
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friendsOnline, setFriendsOnline] = useState(0);
  const [followingLeaderboard, setFollowingLeaderboard] = useState([]);
  const [followingFeed, setFollowingFeed] = useState([]);
  
  // State machine: Map<targetId, {status, loading}>
  const [followStates, setFollowStates] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);
  const optimisticRef = useRef(new Map()); // Track optimistic updates — never overwrite these
  const followingIdsRef = useRef(new Set()); // Track accepted following IDs for feed updates

  // ── Fetch follow states for a list of user IDs ──
  const fetchFollowStates = useCallback(async (targetIds) => {
    if (!userId || !targetIds || targetIds.length === 0) return;
    
    try {
      // Fetch outgoing follows (I follow them)
      const { data: outgoing } = await supabase
        .from("follows")
        .select("following_id, status")
        .eq("follower_id", userId)
        .in("following_id", targetIds);

      // Fetch incoming follows (they follow me)
      const { data: incoming } = await supabase
        .from("follows")
        .select("follower_id, status")
        .eq("following_id", userId)
        .in("follower_id", targetIds)
        .eq("status", "accepted");

      const outgoingMap = new Map(
        (outgoing || []).map((f) => [f.following_id, f.status])
      );
      const incomingSet = new Set(
        (incoming || []).filter(f => f.status === 'accepted').map((f) => f.follower_id)
      );

      setFollowStates((prev) => {
        const next = new Map(prev);
        targetIds.forEach((targetId) => {
          // Skip optimistic updates
          if (optimisticRef.current.has(targetId)) return;

          const outgoingStatus = outgoingMap.get(targetId);
          const hasIncoming = incomingSet.has(targetId);

          let status = 'none';
          if (outgoingStatus === 'accepted' && hasIncoming) {
            status = 'mutual';
          } else if (outgoingStatus === 'accepted') {
            status = 'accepted';
          } else if (outgoingStatus === 'pending') {
            status = 'pending';
          }

          next.set(targetId, { status, loading: false });
        });
        return next;
      });
    } catch (err) {
      console.error("[useFollowing] fetchFollowStates error:", err);
    }
  }, [userId]);

  // ── Get follow state for a specific user (deterministic) ──
  const getFollowState = useCallback((targetId) => {
    if (!targetId || targetId === userId) {
      return { status: 'self', loading: false };
    }
    return followStates.get(targetId) || { status: 'none', loading: false };
  }, [followStates, userId]);
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

      if (ids.length === 0) {
        setFollowing([]);
        setFollowingLeaderboard([]);
        setFriendsOnline(0);
        setFollowingFeed([]);
        return;
      }

      // Fetch follow states for these users
      await fetchFollowStates(ids);

      // Fetch profiles of followed users
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, identity, becoming, xp, level, streak, premium_badge, verified")
        .in("id", ids)
        .order("xp", { ascending: false });

      setFollowing(profiles || []);
      setFollowingLeaderboard(profiles || []);

      // Keep followingIdsRef in sync for realtime feed check
      followingIdsRef.current = new Set(ids);

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
  }, [userId, fetchFollowStates]);

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

  // ── Follow user (with optimistic UI + duplicate guard) ──
  const follow = useCallback(
    async (targetId, targetIsPrivate = false) => {
      if (!userId || userId === targetId) return;
      
      // GUARD: Prevent duplicate — only follow from 'none' state
      const current = followStates.get(targetId);
      if (current && current.status !== 'none') {
        console.warn("[useFollowing] Already in state:", current.status, "— skipping follow");
        return;
      }
      
      // Optimistic update
      const optimisticStatus = targetIsPrivate ? 'pending' : 'accepted';
      const previousState = current || { status: 'none', loading: false };
      
      optimisticRef.current.set(targetId, Date.now());
      setFollowStates((prev) => {
        const next = new Map(prev);
        next.set(targetId, { status: optimisticStatus, loading: true });
        return next;
      });

      try {
        // Use upsert with onConflict to handle unique constraint
        const { error } = await supabase.from("follows").upsert(
          {
            follower_id: userId,
            following_id: targetId,
            status: optimisticStatus,
          },
          { onConflict: "follower_id,following_id" }
        );

        if (error) throw error;

        // Success — clear optimistic flag, keep status
        optimisticRef.current.delete(targetId);
        setFollowStates((prev) => {
          const next = new Map(prev);
          next.set(targetId, { status: optimisticStatus, loading: false });
          return next;
        });
        
        // Refresh lists in background (won't flicker because optimisticRef was cleared)
        fetchFollowing();
        fetchFollowers();
      } catch (err) {
        console.error("[useFollowing] follow error:", err);
        
        // Rollback on error
        optimisticRef.current.delete(targetId);
        setFollowStates((prev) => {
          const next = new Map(prev);
          next.set(targetId, previousState);
          return next;
        });
      }
    },
    [userId, followStates, fetchFollowing, fetchFollowers]
  );

  // ── Unfollow user (with optimistic UI) ──
  const unfollow = useCallback(
    async (targetId) => {
      if (!userId) return;
      
      // Optimistic update
      const previousState = followStates.get(targetId);
      
      optimisticRef.current.set(targetId, true);
      setFollowStates((prev) => {
        const next = new Map(prev);
        next.set(targetId, { status: 'none', loading: true });
        return next;
      });

      try {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("following_id", targetId);

        if (error) throw error;

        // Success
        optimisticRef.current.delete(targetId);
        setFollowStates((prev) => {
          const next = new Map(prev);
          next.set(targetId, { status: 'none', loading: false });
          return next;
        });
        
        fetchFollowing();
      } catch (err) {
        console.error("[useFollowing] unfollow error:", err);
        
        // Rollback on error
        optimisticRef.current.delete(targetId);
        setFollowStates((prev) => {
          const next = new Map(prev);
          if (previousState) {
            next.set(targetId, previousState);
          } else {
            next.set(targetId, { status: 'none', loading: false });
          }
          return next;
        });
      }
    },
    [userId, followStates, fetchFollowing]
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

  // ── Decline follow request (DELETE row so they can request again) ──
  const declineFollowRequest = useCallback(
    async (followerId) => {
      if (!userId) return;
      try {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("following_id", userId);
        fetchPendingRequests();
      } catch (err) {
        console.error("[useFollowing] decline error:", err);
      }
    },
    [userId, fetchPendingRequests]
  );

  // ── Check if following ── (kept for backwards compatibility)
  const isFollowing = useCallback(
    (targetId) => {
      const state = getFollowState(targetId);
      return state.status === 'accepted' || state.status === 'mutual';
    },
    [getFollowState]
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
            // Don't refetch if we have optimistic update in progress
            const targetId = row.follower_id === userId ? row.following_id : row.follower_id;
            if (!optimisticRef.current.has(targetId)) {
              fetchFollowing();
              fetchFollowers();
              fetchPendingRequests();
              // Refresh state for this specific user
              if (targetId) {
                fetchFollowStates([targetId]);
              }
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_activity" },
        (payload) => {
          // Update feed if activity is from a followed user
          if (followingIdsRef.current.has(payload.new.user_id)) {
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
  }, [userId, fetchFollowing, fetchFollowers, fetchPendingRequests, fetchFollowStates]);

  return {
    following,
    followers,
    pendingRequests,
    friendsOnline,
    followingLeaderboard,
    followingFeed,
    followStates,
    getFollowState,
    isFollowing, // Backwards compatibility
    follow,
    unfollow,
    acceptFollowRequest,
    declineFollowRequest,
    fetchFollowStates, // Expose for Discover tab
    loading,
  };
}
