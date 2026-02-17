import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useFeed v3 — Stable Feed Engine (no glitch)
 *
 * Key stability fixes:
 *  - Tab & followingIds stored in refs → no callback chain reaction
 *  - fetchPosts is referentially stable (deps: userId only)
 *  - likePost/repostPost use functional setPosts (no posts dep)
 *  - Tab change triggers fetch via explicit call, not useEffect cascade
 */

const PAGE_SIZE = 20;

const POST_SELECT = `
  *,
  profiles!posts_user_id_fkey(
    id, identity, becoming, xp, level, streak,
    total_focus_hours, verified, badge_type
  ),
  post_likes(user_id),
  post_reposts(user_id),
  post_replies(id, content, user_id, created_at, profiles:user_id(id, identity))
`;

export function useFeed(userId, followingIds = []) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTabState] = useState("for-you");
  const [newCount, setNewCount] = useState(0);

  // ── Refs for stable callbacks ──
  const tabRef = useRef(tab);
  const followingRef = useRef(followingIds);
  const pageRef = useRef(0);
  const newPostsRef = useRef([]);
  const channelRef = useRef(null);
  const isMountedRef = useRef(false);
  const fetchingRef = useRef(false);

  // Keep refs in sync
  tabRef.current = tab;
  followingRef.current = followingIds;

  // ── Build query (reads from refs, not deps) ──
  const buildQuery = useCallback((from, to) => {
    const currentTab = tabRef.current;
    const fIds = followingRef.current;

    if (currentTab === "for-you") {
      return supabase
        .from("posts")
        .select(POST_SELECT)
        .order("score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to);
    }
    if (currentTab === "following") {
      if (!fIds.length) return null;
      return supabase
        .from("posts")
        .select(POST_SELECT)
        .in("user_id", fIds)
        .order("created_at", { ascending: false })
        .range(from, to);
    }
    if (currentTab === "trending") {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      return supabase
        .from("posts")
        .select(POST_SELECT)
        .gte("created_at", dayAgo)
        .order("likes_count", { ascending: false })
        .order("replies_count", { ascending: false })
        .range(from, to);
    }
    return null;
  }, []); // stable — reads from refs

  // ── Fetch posts (stable — only depends on userId) ──
  const fetchPosts = useCallback(async (page = 0, append = false) => {
    if (!userId) { setLoading(false); return; }
    if (fetchingRef.current && page === 0) return; // prevent double-fire
    fetchingRef.current = true;

    if (page === 0 && !append) setLoading(true);

    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const query = buildQuery(from, to);

      if (!query) {
        if (!append) setPosts([]);
        setLoading(false);
        setHasMore(false);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;

      const fetched = data || [];
      setHasMore(fetched.length === PAGE_SIZE);

      if (append) {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const unique = fetched.filter((p) => !existingIds.has(p.id));
          return [...prev, ...unique];
        });
      } else {
        setPosts(fetched);
      }
    } catch (err) {
      console.error("[useFeed] fetch error:", err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [userId, buildQuery]);

  // ── Initial fetch (once) ──
  useEffect(() => {
    if (isMountedRef.current) return;
    isMountedRef.current = true;
    fetchPosts(0, false);
  }, [fetchPosts]);

  // ── Tab change handler (explicit, not effect cascade) ──
  const setTab = useCallback((newTab) => {
    if (newTab === tabRef.current) return;
    setTabState(newTab);
    tabRef.current = newTab;
    pageRef.current = 0;
    newPostsRef.current = [];
    setNewCount(0);
    setHasMore(true);
    fetchPosts(0, false);
  }, [fetchPosts]);

  // ── Load more (infinite scroll) ──
  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore) return;
    pageRef.current += 1;
    fetchPosts(pageRef.current, true);
  }, [hasMore, fetchPosts]);

  // ── Realtime — count new posts for banner ──
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel("feed-realtime-v2")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          if (payload.new.user_id === userId) return;
          const currentTab = tabRef.current;
          const fIds = followingRef.current;
          if (currentTab === "following" && !fIds.includes(payload.new.user_id)) return;
          newPostsRef.current.push(payload.new);
          setNewCount((c) => c + 1);
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
  }, [userId]); // stable — tab/following read from refs

  // ── Load new posts (banner click) ──
  const loadNew = useCallback(() => {
    newPostsRef.current = [];
    setNewCount(0);
    pageRef.current = 0;
    fetchPosts(0, false);
  }, [fetchPosts]);

  // ── Like post (optimistic — no posts dependency) ──
  const likePost = useCallback(async (postId) => {
    if (!userId) return;

    let wasLiked = false;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        wasLiked = (p.post_likes || []).some((l) => l.user_id === userId);
        return {
          ...p,
          likes_count: (p.likes_count || 0) + (wasLiked ? -1 : 1),
          post_likes: wasLiked
            ? (p.post_likes || []).filter((l) => l.user_id !== userId)
            : [...(p.post_likes || []), { user_id: userId }],
        };
      })
    );

    try {
      if (wasLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
        if (error && error.code === "23505") return;
        if (error) throw error;
      }
    } catch (err) {
      console.error("[useFeed] like error:", err);
      fetchPosts(0, false);
    }
  }, [userId, fetchPosts]);

  // ── Repost (optimistic — no posts dependency) ──
  const repostPost = useCallback(async (postId) => {
    if (!userId) return;

    let wasReposted = false;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        wasReposted = (p.post_reposts || []).some((r) => r.user_id === userId);
        return {
          ...p,
          reposts_count: (p.reposts_count || 0) + (wasReposted ? -1 : 1),
          post_reposts: wasReposted
            ? (p.post_reposts || []).filter((r) => r.user_id !== userId)
            : [...(p.post_reposts || []), { user_id: userId }],
        };
      })
    );

    try {
      if (wasReposted) {
        await supabase.from("post_reposts").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        const { error } = await supabase.from("post_reposts").insert({ post_id: postId, user_id: userId });
        if (error && error.code === "23505") return;
        if (error) throw error;
      }
    } catch (err) {
      console.error("[useFeed] repost error:", err);
      fetchPosts(0, false);
    }
  }, [userId, fetchPosts]);

  // ── Report ──
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

  // ── Create post (+5 XP) ──
  const createPost = useCallback(async (type, content) => {
    if (!userId || !content.trim()) return null;
    try {
      const { data, error } = await supabase
        .from("posts")
        .insert({ user_id: userId, type, content: content.trim() })
        .select(POST_SELECT)
        .single();
      if (error) throw error;

      if (data) setPosts((prev) => [data, ...prev]);

      // XP reward
      const { data: prof } = await supabase
        .from("profiles")
        .select("xp, level")
        .eq("id", userId)
        .single();
      if (prof) {
        const newXP = (prof.xp || 0) + 5;
        await supabase
          .from("profiles")
          .update({ xp: newXP, level: Math.floor(Math.sqrt(newXP / 50)) })
          .eq("id", userId);
      }

      return data;
    } catch (err) {
      console.error("[useFeed] post error:", err);
      return null;
    }
  }, [userId]);

  // ── Reply ──
  const replyToPost = useCallback(async (postId, content) => {
    if (!userId || !content.trim()) return null;
    try {
      const { data, error } = await supabase
        .from("post_replies")
        .insert({ post_id: postId, user_id: userId, content: content.trim() })
        .select("id, content, user_id, created_at, profiles:user_id(id, identity)")
        .single();
      if (error) throw error;

      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          return {
            ...p,
            replies_count: (p.replies_count || 0) + 1,
            post_replies: [...(p.post_replies || []), data],
          };
        })
      );
      return data;
    } catch (err) {
      console.error("[useFeed] reply error:", err);
      return null;
    }
  }, [userId]);

  return {
    posts,
    loading,
    hasMore,
    tab,
    setTab,
    newCount,
    loadNew,
    loadMore,
    likePost,
    repostPost,
    reportPost,
    createPost,
    replyToPost,
    refresh: () => { pageRef.current = 0; fetchPosts(0, false); },
  };
}
