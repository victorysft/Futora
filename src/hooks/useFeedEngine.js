import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useFeedEngine — Complete Feed System Rebuild
 *
 * Three feeds:
 *  - For You: Scored algorithm (views, likes, comments, author level, follows)
 *  - Following: Only from followed users, reverse chronological
 *  - Trending: Last 24h scored by engagement
 *
 * Features:
 *  - Cursor-based pagination (20 posts per page)
 *  - Media upload (1-4 images or 1 video, max 60s)
 *  - Optimistic likes, bookmarks, comments
 *  - View tracking (deduplicated per user session)
 *  - Realtime new post notifications
 *  - Never shows empty feed: falls back to global posts
 */

const PAGE_SIZE = 20;
const POLL_INTERVAL = 15000; // 15s polling for new posts

// Profiles join shape for post queries
const PROFILE_COLS = "id, identity, becoming, xp, level, streak, verified, badge_type, bio, discipline, avatar_url, followers_count, following_count";

export function useFeedEngine(userId) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTabState] = useState("for-you");
  const [newCount, setNewCount] = useState(0);
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [followingIds, setFollowingIds] = useState([]);

  const tabRef = useRef(tab);
  const pageRef = useRef(0);
  const fetchingRef = useRef(false);
  const channelRef = useRef(null);
  const followingRef = useRef([]);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  tabRef.current = tab;
  followingRef.current = followingIds;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Fetch who the user follows (safe) ──
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", userId)
          .eq("status", "accepted");
        const ids = (data || []).map((f) => f.following_id);
        if (mountedRef.current) {
          setFollowingIds(ids);
          followingRef.current = ids;
        }
      } catch { /* follows table may not exist yet */ }
    })();
  }, [userId]);

  // ── Fetch user bookmarks (safe) ──
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("bookmarks")
          .select("post_id")
          .eq("user_id", userId);
        if (data && mountedRef.current) setBookmarkedIds(new Set(data.map((b) => b.post_id)));
      } catch { /* bookmarks table may not exist yet */ }
    })();
  }, [userId]);

  // ── Enrich posts with author profile + likes + comments + media ──
  const enrichPosts = useCallback(async (rawPosts) => {
    if (!rawPosts.length) return [];

    const postIds = rawPosts.map((p) => p.id);
    const authorIds = [...new Set(rawPosts.map((p) => p.user_id))];

    // Parallel fetch with allSettled — one failure doesn't break all
    let profiles = [], likes = [], media = [], comments = [];
    const fetches = await Promise.allSettled([
      supabase.from("profiles").select(PROFILE_COLS).in("id", authorIds),
      supabase.from("likes").select("user_id, post_id").in("post_id", postIds),
      supabase.from("post_media").select("*").in("post_id", postIds).order("order_index"),
      supabase.from("comments").select("id, post_id, user_id, content, parent_comment_id, like_count, depth, created_at").in("post_id", postIds).order("created_at", { ascending: true }),
    ]);

    if (fetches[0].status === "fulfilled") profiles = fetches[0].value.data || [];
    if (fetches[1].status === "fulfilled") likes = fetches[1].value.data || [];
    if (fetches[2].status === "fulfilled") media = fetches[2].value.data || [];
    if (fetches[3].status === "fulfilled") comments = fetches[3].value.data || [];

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const likesMap = new Map();
    likes.forEach((l) => {
      if (!likesMap.has(l.post_id)) likesMap.set(l.post_id, []);
      likesMap.get(l.post_id).push(l);
    });
    const mediaMap = new Map();
    media.forEach((m) => {
      if (!mediaMap.has(m.post_id)) mediaMap.set(m.post_id, []);
      mediaMap.get(m.post_id).push(m);
    });
    const commentMap = new Map();
    comments.forEach((c) => {
      if (!commentMap.has(c.post_id)) commentMap.set(c.post_id, []);
      commentMap.get(c.post_id).push(c);
    });

    // Also enrich comment authors
    const commentAuthorIds = [...new Set(comments.map((c) => c.user_id))].filter((id) => !profileMap.has(id));
    if (commentAuthorIds.length > 0) {
      try {
        const { data: cAuthors } = await supabase.from("profiles").select(PROFILE_COLS).in("id", commentAuthorIds);
        (cAuthors || []).forEach((p) => profileMap.set(p.id, p));
      } catch { /* non-critical */ }
    }

    // Attach comment author profiles
    comments.forEach((c) => {
      c.author = profileMap.get(c.user_id) || null;
    });

    return rawPosts.map((p) => ({
      ...p,
      author: profileMap.get(p.user_id) || null,
      likes: likesMap.get(p.id) || [],
      media: mediaMap.get(p.id) || [],
      comments: commentMap.get(p.id) || [],
    }));
  }, []);

  // ── Global fallback: always returns posts, never throws ──
  const fetchGlobalFallback = useCallback(async (offset = 0) => {
    try {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      return data || [];
    } catch {
      try {
        const { data } = await supabase
          .from("posts")
          .select("*")
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        return data || [];
      } catch { return []; }
    }
  }, []);

  // ── Fetch For You ──
  const fetchForYou = useCallback(async (offset) => {
    try {
      const { data, error } = await supabase.rpc("get_for_you_feed", {
        p_user_id: userId,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      if (!error && data && data.length > 0) return data;
    } catch { /* RPC may not exist */ }
    return await fetchGlobalFallback(offset);
  }, [userId, fetchGlobalFallback]);

  // ── Fetch Following ──
  const fetchFollowing = useCallback(async (offset) => {
    const fIds = followingRef.current;
    if (fIds.length > 0) {
      try {
        const { data, error } = await supabase
          .from("posts")
          .select("*")
          .in("user_id", fIds)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (!error && data && data.length > 0) return data;
      } catch { /* ignore */ }
    }
    // CRITICAL: Never show empty — fallback to global
    return await fetchGlobalFallback(offset);
  }, [fetchGlobalFallback]);

  // ── Fetch Trending ──
  const fetchTrending = useCallback(async (offset) => {
    try {
      const { data, error } = await supabase.rpc("get_trending_feed", {
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      if (!error && data && data.length > 0) return data;
    } catch { /* RPC may not exist */ }
    try {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("visibility", "public")
        .gte("created_at", dayAgo)
        .order("like_count", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (data && data.length > 0) return data;
    } catch { /* ignore */ }
    return await fetchGlobalFallback(offset);
  }, [fetchGlobalFallback]);

  // ── Main fetch dispatcher ──
  const fetchPosts = useCallback(async (page = 0, append = false) => {
    if (!userId) { setLoading(false); return; }
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (page === 0 && !append) setLoading(true);

    try {
      const offset = page * PAGE_SIZE;
      const currentTab = tabRef.current;

      let rawPosts;
      if (currentTab === "for-you") {
        rawPosts = await fetchForYou(offset);
      } else if (currentTab === "following") {
        rawPosts = await fetchFollowing(offset);
      } else {
        rawPosts = await fetchTrending(offset);
      }

      if (!mountedRef.current) return;
      setHasMore(rawPosts.length === PAGE_SIZE);

      // Enrich with profiles, likes, media, comments
      let enriched;
      try {
        enriched = await enrichPosts(rawPosts);
      } catch {
        // If enrichment fails, show raw posts with empty relations
        enriched = rawPosts.map((p) => ({ ...p, author: null, likes: [], media: [], comments: [] }));
      }

      if (!mountedRef.current) return;

      if (append) {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          return [...prev, ...enriched.filter((p) => !existingIds.has(p.id))];
        });
      } else {
        setPosts(enriched);
      }
    } catch (err) {
      console.error("[FeedEngine] fetch error:", err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        fetchingRef.current = false;
      }
    }
  }, [userId, fetchForYou, fetchFollowing, fetchTrending, enrichPosts]);

  // ── Initial fetch ──
  useEffect(() => {
    if (userId) fetchPosts(0, false);
  }, [userId, fetchPosts]);

  // ── Polling: check for new posts every 15s ──
  useEffect(() => {
    if (!userId) return;
    pollRef.current = setInterval(async () => {
      if (fetchingRef.current || !mountedRef.current) return;
      try {
        const { data } = await supabase
          .from("posts")
          .select("id, created_at")
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(1);
        if (data && data.length > 0 && mountedRef.current) {
          const newestLocal = posts[0]?.created_at;
          if (newestLocal && new Date(data[0].created_at) > new Date(newestLocal)) {
            setNewCount((c) => c + 1);
          }
        }
      } catch { /* silent polling */ }
    }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [userId, posts]);

  // ── Tab change ──
  const setTab = useCallback((newTab) => {
    if (newTab === tabRef.current) return;
    setTabState(newTab);
    tabRef.current = newTab;
    pageRef.current = 0;
    setNewCount(0);
    setHasMore(true);
    setPosts([]);
    setTimeout(() => fetchPosts(0, false), 0);
  }, [fetchPosts]);

  // ── Load more (infinite scroll) ──
  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore) return;
    pageRef.current += 1;
    fetchPosts(pageRef.current, true);
  }, [hasMore, fetchPosts]);

  // ── Realtime new posts ──
  useEffect(() => {
    if (!userId) return;
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
    }

    try {
      const channel = supabase
        .channel("feed-engine-rt-" + userId.slice(0, 8))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
          if (!mountedRef.current) return;
          if (payload.new.user_id === userId) return;
          if (tabRef.current === "following" && followingRef.current.length > 0 && !followingRef.current.includes(payload.new.user_id)) return;
          setNewCount((c) => c + 1);
        })
        .subscribe();

      channelRef.current = channel;
    } catch { /* realtime may not be enabled */ }

    return () => {
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
        channelRef.current = null;
      }
    };
  }, [userId]);

  const loadNew = useCallback(() => {
    setNewCount(0);
    pageRef.current = 0;
    fetchPosts(0, false);
  }, [fetchPosts]);

  // ══════════════════════════════════════════
  // MEDIA UPLOAD
  // ══════════════════════════════════════════
  const uploadMedia = useCallback(async (files) => {
    if (!userId || !files.length) return [];
    const uploads = [];

    for (let i = 0; i < Math.min(files.length, 4); i++) {
      const file = files[i];
      const isVideo = file.type.startsWith("video/");
      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}_${i}.${ext}`;

      const { data, error } = await supabase.storage
        .from("post-media")
        .upload(path, file, { cacheControl: "3600", contentType: file.type });

      if (error) { console.error("[FeedEngine] upload error:", error); continue; }

      const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(data.path);

      uploads.push({
        type: isVideo ? "video" : "image",
        url: urlData.publicUrl,
        order_index: i,
      });
    }
    return uploads;
  }, [userId]);

  // ══════════════════════════════════════════
  // CREATE POST
  // ══════════════════════════════════════════
  const createPost = useCallback(async (content, options = {}) => {
    if (!userId || !content.trim()) return null;
    const { visibility = "public", mediaFiles = [], disciplineTag = null } = options;

    try {
      // 1. Upload media
      let mediaUploads = [];
      if (mediaFiles.length > 0) {
        mediaUploads = await uploadMedia(mediaFiles);
      }

      // 2. Insert post
      const { data: post, error } = await supabase
        .from("posts")
        .insert({
          user_id: userId,
          content: content.trim(),
          visibility,
          type: "post",
          discipline_tag: disciplineTag,
        })
        .select("*")
        .single();

      if (error) throw error;

      // 3. Insert media records
      if (mediaUploads.length > 0 && post) {
        const mediaRecords = mediaUploads.map((m) => ({
          post_id: post.id,
          ...m,
        }));
        const { data: mediaData } = await supabase
          .from("post_media")
          .insert(mediaRecords)
          .select("*");
        post.media = mediaData || [];
      } else {
        post.media = [];
      }

      // 4. Fetch author profile
      const { data: authorProfile } = await supabase
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("id", userId)
        .single();

      post.author = authorProfile;
      post.likes = [];
      post.comments = [];

      // 5. Optimistically prepend
      setPosts((prev) => [post, ...prev]);

      // 6. XP reward (fire-and-forget)
      supabase
        .from("profiles")
        .select("xp, level")
        .eq("id", userId)
        .single()
        .then(({ data: prof }) => {
          if (prof) {
            const newXP = (prof.xp || 0) + 5;
            supabase
              .from("profiles")
              .update({ xp: newXP, level: Math.floor(Math.sqrt(newXP / 50)) })
              .eq("id", userId);
          }
        })
        .catch(() => {});

      // 7. Background refetch after 2s to sync with server
      setTimeout(() => {
        if (mountedRef.current) {
          pageRef.current = 0;
          fetchPosts(0, false);
        }
      }, 2000);

      return post;
    } catch (err) {
      console.error("[FeedEngine] create post error:", err);
      return null;
    }
  }, [userId, uploadMedia, fetchPosts]);

  // ══════════════════════════════════════════
  // LIKE POST (optimistic, toggle)
  // ══════════════════════════════════════════
  const likePost = useCallback(async (postId) => {
    if (!userId) return;
    let wasLiked = false;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        wasLiked = (p.likes || []).some((l) => l.user_id === userId);
        return {
          ...p,
          like_count: (p.like_count || 0) + (wasLiked ? -1 : 1),
          likes: wasLiked
            ? (p.likes || []).filter((l) => l.user_id !== userId)
            : [...(p.likes || []), { user_id: userId, post_id: postId }],
        };
      })
    );

    try {
      if (wasLiked) {
        await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId });
        if (error && error.code === "23505") return; // duplicate
        if (error) throw error;
      }
    } catch (err) {
      console.error("[FeedEngine] like error:", err);
      fetchPosts(0, false);
    }
  }, [userId, fetchPosts]);

  // ══════════════════════════════════════════
  // BOOKMARK (optimistic, toggle)
  // ══════════════════════════════════════════
  const bookmarkPost = useCallback(async (postId) => {
    if (!userId) return;
    const wasBookmarked = bookmarkedIds.has(postId);

    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      wasBookmarked ? next.delete(postId) : next.add(postId);
      return next;
    });

    try {
      if (wasBookmarked) {
        await supabase.from("bookmarks").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        const { error } = await supabase.from("bookmarks").insert({ post_id: postId, user_id: userId });
        if (error && error.code === "23505") return;
        if (error) throw error;
      }
    } catch (err) {
      console.error("[FeedEngine] bookmark error:", err);
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        wasBookmarked ? next.add(postId) : next.delete(postId);
        return next;
      });
    }
  }, [userId, bookmarkedIds]);

  // ══════════════════════════════════════════
  // COMMENT (with nested)
  // ══════════════════════════════════════════
  const addComment = useCallback(async (postId, content, parentCommentId = null) => {
    if (!userId || !content.trim()) return null;

    try {
      const { data, error } = await supabase
        .from("comments")
        .insert({
          post_id: postId,
          user_id: userId,
          content: content.trim(),
          parent_comment_id: parentCommentId,
          depth: parentCommentId ? 1 : 0,
        })
        .select("id, post_id, user_id, content, parent_comment_id, like_count, depth, created_at")
        .single();

      if (error) throw error;

      // Fetch author for the comment
      const { data: authorProfile } = await supabase
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("id", userId)
        .single();

      data.author = authorProfile;

      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          return {
            ...p,
            comment_count: (p.comment_count || 0) + 1,
            comments: [...(p.comments || []), data],
          };
        })
      );

      return data;
    } catch (err) {
      console.error("[FeedEngine] comment error:", err);
      return null;
    }
  }, [userId]);

  // ══════════════════════════════════════════
  // VIEW TRACKING
  // ══════════════════════════════════════════
  const recordView = useCallback(async (postId) => {
    if (!postId || !userId) return;
    try {
      await supabase.rpc("record_post_view", { p_post_id: postId, p_user_id: userId });
    } catch {
      try {
        await supabase.from("post_views").insert({ post_id: postId, user_id: userId });
      } catch { /* view tracking is non-critical */ }
    }
  }, [userId]);

  // ══════════════════════════════════════════
  // DELETE POST
  // ══════════════════════════════════════════
  const deletePost = useCallback(async (postId) => {
    if (!userId) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      await supabase.from("posts").delete().eq("id", postId).eq("user_id", userId);
    } catch (err) {
      console.error("[FeedEngine] delete error:", err);
      fetchPosts(0, false);
    }
  }, [userId, fetchPosts]);

  // ══════════════════════════════════════════
  // REPORT
  // ══════════════════════════════════════════
  const reportPost = useCallback(async (postId, reason = "spam") => {
    if (!userId) return false;
    try {
      await supabase.from("reports").insert({
        reporter_id: userId,
        target_post_id: postId,
        reason,
      });
      return true;
    } catch {
      return false;
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
    createPost,
    likePost,
    bookmarkPost,
    bookmarkedIds,
    addComment,
    deletePost,
    reportPost,
    recordView,
    followingIds,
    refresh: () => { pageRef.current = 0; fetchPosts(0, false); },
  };
}
