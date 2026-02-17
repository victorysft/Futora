import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useFeed — Social feed engine
 *
 * Tabs:
 *  - "for-you"   → Score-ranked posts (engagement + author quality - time decay)
 *  - "following"  → Chronological from followed users
 *  - "trending"   → Highest engagement in last 24h
 *
 * Returns: { posts, loading, hasMore, loadMore, likePost, repostPost, reportPost }
 */

const PAGE_SIZE = 20;

export function useFeed(userId, tab = "for-you", followingIds = []) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [myLikes, setMyLikes] = useState(new Set());
  const [myReposts, setMyReposts] = useState(new Set());
  const pageRef = useRef(0);
  const channelRef = useRef(null);

  // ── Fetch posts ──
  const fetchPosts = useCallback(async (page = 0, append = false) => {
    if (!userId) { setLoading(false); return; }
    if (page === 0) setLoading(true);

    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query;

      if (tab === "for-you") {
        // Score-ranked: compute inline score
        query = supabase
          .from("posts")
          .select("*, profiles!posts_user_id_fkey(id, identity, becoming, xp, level, streak, focus, verified, badge_type)")
          .order("score", { ascending: false })
          .range(from, to);

      } else if (tab === "following") {
        if (!followingIds.length) {
          setPosts(append ? (prev) => prev : []);
          setLoading(false);
          setHasMore(false);
          return;
        }
        query = supabase
          .from("posts")
          .select("*, profiles!posts_user_id_fkey(id, identity, becoming, xp, level, streak, focus, verified, badge_type)")
          .in("user_id", followingIds)
          .order("created_at", { ascending: false })
          .range(from, to);

      } else if (tab === "trending") {
        const dayAgo = new Date(Date.now() - 86400000).toISOString();
        query = supabase
          .from("posts")
          .select("*, profiles!posts_user_id_fkey(id, identity, becoming, xp, level, streak, focus, verified, badge_type)")
          .gte("created_at", dayAgo)
          .order("likes_count", { ascending: false })
          .range(from, to);
      }

      const { data, error } = await query;
      if (error) throw error;

      const fetched = data || [];
      setHasMore(fetched.length === PAGE_SIZE);

      if (append) {
        setPosts((prev) => [...prev, ...fetched]);
      } else {
        setPosts(fetched);
      }

      // Fetch user interactions for these posts
      if (fetched.length > 0) {
        const postIds = fetched.map((p) => p.id);
        const [likesRes, repostsRes] = await Promise.all([
          supabase
            .from("post_likes")
            .select("post_id")
            .in("post_id", postIds)
            .eq("user_id", userId),
          supabase
            .from("post_reposts")
            .select("post_id")
            .in("post_id", postIds)
            .eq("user_id", userId),
        ]);
        if (!append) {
          setMyLikes(new Set((likesRes.data || []).map((l) => l.post_id)));
          setMyReposts(new Set((repostsRes.data || []).map((r) => r.post_id)));
        } else {
          setMyLikes((prev) => {
            const next = new Set(prev);
            (likesRes.data || []).forEach((l) => next.add(l.post_id));
            return next;
          });
          setMyReposts((prev) => {
            const next = new Set(prev);
            (repostsRes.data || []).forEach((r) => next.add(r.post_id));
            return next;
          });
        }
      }
    } catch (err) {
      console.error("[useFeed] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, tab, followingIds]);

  // Reset & fetch on tab change
  useEffect(() => {
    pageRef.current = 0;
    fetchPosts(0, false);
  }, [fetchPosts]);

  // ── Load more ──
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    pageRef.current += 1;
    fetchPosts(pageRef.current, true);
  }, [loading, hasMore, fetchPosts]);

  // ── Realtime subscription for new posts ──
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel("feed-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          // Only prepend if on for-you or trending (not following unless in followingIds)
          if (tab === "following" && !followingIds.includes(payload.new.user_id)) return;
          // Fetch author profile for the new post
          supabase
            .from("profiles")
            .select("id, identity, becoming, xp, level, streak, focus, verified, badge_type")
            .eq("id", payload.new.user_id)
            .single()
            .then(({ data: profile }) => {
              const enriched = { ...payload.new, profiles: profile };
              setPosts((prev) => [enriched, ...prev]);
            });
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tab, followingIds]);

  // ── Like post ──
  const likePost = useCallback(async (postId) => {
    if (!userId) return;
    const alreadyLiked = myLikes.has(postId);

    // Optimistic
    setMyLikes((prev) => {
      const next = new Set(prev);
      alreadyLiked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, likes_count: p.likes_count + (alreadyLiked ? -1 : 1) }
          : p
      )
    );

    try {
      if (alreadyLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
      }
    } catch (err) {
      console.error("[useFeed] like error:", err);
      // Revert
      setMyLikes((prev) => {
        const next = new Set(prev);
        alreadyLiked ? next.add(postId) : next.delete(postId);
        return next;
      });
      fetchPosts(0, false);
    }
  }, [userId, myLikes, fetchPosts]);

  // ── Repost ──
  const repostPost = useCallback(async (postId) => {
    if (!userId) return;
    const alreadyReposted = myReposts.has(postId);

    setMyReposts((prev) => {
      const next = new Set(prev);
      alreadyReposted ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, reposts_count: p.reposts_count + (alreadyReposted ? -1 : 1) }
          : p
      )
    );

    try {
      if (alreadyReposted) {
        await supabase.from("post_reposts").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        await supabase.from("post_reposts").insert({ post_id: postId, user_id: userId });
      }
    } catch (err) {
      console.error("[useFeed] repost error:", err);
      setMyReposts((prev) => {
        const next = new Set(prev);
        alreadyReposted ? next.add(postId) : next.delete(postId);
        return next;
      });
      fetchPosts(0, false);
    }
  }, [userId, myReposts, fetchPosts]);

  // ── Report post ──
  const reportPost = useCallback(async (postId, reason = "spam") => {
    if (!userId) return false;
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: userId,
        target_post_id: postId,
        reason,
      });
      return !error;
    } catch {
      return false;
    }
  }, [userId]);

  // ── Create post (with XP reward) ──
  const createPost = useCallback(async (type, content) => {
    if (!userId || !content.trim()) return null;
    try {
      const { data, error } = await supabase
        .from("posts")
        .insert({ user_id: userId, type, content: content.trim() })
        .select()
        .single();
      if (error) throw error;

      // Small XP reward for posting (5 XP)
      const { data: prof } = await supabase
        .from("profiles")
        .select("xp, level")
        .eq("id", userId)
        .single();

      if (prof) {
        const newXP = (prof.xp || 0) + 5;
        const newLevel = Math.floor(Math.sqrt(newXP / 50));
        await supabase
          .from("profiles")
          .update({ xp: newXP, level: newLevel })
          .eq("id", userId);
      }

      return data;
    } catch (err) {
      console.error("[useFeed] post error:", err);
      return null;
    }
  }, [userId]);

  return {
    posts,
    loading,
    hasMore,
    myLikes,
    myReposts,
    loadMore,
    likePost,
    repostPost,
    reportPost,
    createPost,
    refresh: () => { pageRef.current = 0; fetchPosts(0, false); },
  };
}
