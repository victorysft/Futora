import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useFeed v4 — Feed 2.0 Engine (X-style)
 *
 * New features over v3:
 *  - Media upload (1-4 images, 1 video) via Supabase Storage
 *  - Bookmarks (save/unsave)
 *  - View tracking (record_post_view RPC)
 *  - Discipline tags
 *  - Visibility toggle (public/community/followers)
 *  - Enhanced post_replies with nested comments
 *  - Optimistic updates for all interactions
 */

const PAGE_SIZE = 20;

const POST_SELECT = `
  *,
  profiles!posts_user_id_fkey(
    id, identity, becoming, xp, level, streak,
    total_focus_hours, verified, badge_type, bio,
    discipline, avatar_url, followers_count, following_count
  ),
  post_likes(user_id),
  post_reposts(user_id),
  post_media(id, media_type, url, thumbnail, width, height, duration_ms, sort_order),
  post_replies(
    id, content, user_id, created_at, likes_count, is_pinned, parent_reply_id, depth,
    profiles:user_id(id, identity, avatar_url, level, xp, verified)
  )
`;

const BOOKMARK_SELECT = `
  id,
  post_id,
  created_at,
  posts(
    ${POST_SELECT.replace('*,', 'id, user_id, type, content, discipline_tag, visibility, views_count, bookmarks_count, likes_count, replies_count, reposts_count, media_count, score, is_pinned, created_at,')}
  )
`;

export function useFeedV4(userId, followingIds = []) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTabState] = useState("for-you");
  const [newCount, setNewCount] = useState(0);
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());

  // ── Stable refs ──
  const tabRef = useRef(tab);
  const followingRef = useRef(followingIds);
  const pageRef = useRef(0);
  const newPostsRef = useRef([]);
  const channelRef = useRef(null);
  const isMountedRef = useRef(false);
  const fetchingRef = useRef(false);

  tabRef.current = tab;
  followingRef.current = followingIds;

  // ── Fetch user's bookmarks on mount ──
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("bookmarks")
      .select("post_id")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) setBookmarkedIds(new Set(data.map((b) => b.post_id)));
      });
  }, [userId]);

  // ── Build query ──
  const buildQuery = useCallback((from, to) => {
    const currentTab = tabRef.current;
    const fIds = followingRef.current;

    if (currentTab === "for-you") {
      return supabase
        .from("posts")
        .select(POST_SELECT)
        .eq("visibility", "public")
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
        .eq("visibility", "public")
        .order("likes_count", { ascending: false })
        .order("views_count", { ascending: false })
        .range(from, to);
    }
    return null;
  }, []);

  // ── Fetch posts ──
  const fetchPosts = useCallback(async (page = 0, append = false) => {
    if (!userId) { setLoading(false); return; }
    if (fetchingRef.current && page === 0) return;
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

      const fetched = (data || []).map((p) => ({
        ...p,
        post_media: (p.post_media || []).sort((a, b) => a.sort_order - b.sort_order),
      }));
      setHasMore(fetched.length === PAGE_SIZE);

      if (append) {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          return [...prev, ...fetched.filter((p) => !existingIds.has(p.id))];
        });
      } else {
        setPosts(fetched);
      }
    } catch (err) {
      console.error("[useFeedV4] fetch error:", err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [userId, buildQuery]);

  // ── Initial fetch ──
  useEffect(() => {
    if (isMountedRef.current) return;
    isMountedRef.current = true;
    fetchPosts(0, false);
  }, [fetchPosts]);

  // ── Tab change ──
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

  // ── Load more ──
  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMore) return;
    pageRef.current += 1;
    fetchPosts(pageRef.current, true);
  }, [hasMore, fetchPosts]);

  // ── Realtime ──
  useEffect(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel("feed-v4-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          if (payload.new.user_id === userId) return;
          const fIds = followingRef.current;
          if (tabRef.current === "following" && !fIds.includes(payload.new.user_id)) return;
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
  }, [userId]);

  const loadNew = useCallback(() => {
    newPostsRef.current = [];
    setNewCount(0);
    pageRef.current = 0;
    fetchPosts(0, false);
  }, [fetchPosts]);

  // ══════════════════════════════════════════════════════════
  // MEDIA UPLOAD
  // ══════════════════════════════════════════════════════════
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
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error("[useFeedV4] upload error:", error);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("post-media")
        .getPublicUrl(data.path);

      uploads.push({
        media_type: isVideo ? "video" : "image",
        url: urlData.publicUrl,
        sort_order: i,
        file_size: file.size,
      });
    }

    return uploads;
  }, [userId]);

  // ══════════════════════════════════════════════════════════
  // CREATE POST (with media, discipline, visibility)
  // ══════════════════════════════════════════════════════════
  const createPost = useCallback(async (type, content, options = {}) => {
    if (!userId || !content.trim()) return null;
    const { disciplineTag, visibility = "public", mediaFiles = [] } = options;

    try {
      // 1. Upload media first
      let mediaUploads = [];
      if (mediaFiles.length > 0) {
        mediaUploads = await uploadMedia(mediaFiles);
      }

      // 2. Create post
      const { data, error } = await supabase
        .from("posts")
        .insert({
          user_id: userId,
          type,
          content: content.trim(),
          discipline_tag: disciplineTag || null,
          visibility,
          media_count: mediaUploads.length,
        })
        .select(POST_SELECT)
        .single();

      if (error) throw error;

      // 3. Insert media records
      if (mediaUploads.length > 0 && data) {
        const mediaRecords = mediaUploads.map((m) => ({
          post_id: data.id,
          user_id: userId,
          ...m,
        }));
        const { data: mediaData } = await supabase
          .from("post_media")
          .insert(mediaRecords)
          .select("*");

        if (mediaData) data.post_media = mediaData;
      }

      if (data) setPosts((prev) => [data, ...prev]);

      // 4. XP reward (+5 XP for posting)
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
      console.error("[useFeedV4] post error:", err);
      return null;
    }
  }, [userId, uploadMedia]);

  // ── Like post (optimistic) ──
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
      console.error("[useFeedV4] like error:", err);
      fetchPosts(0, false);
    }
  }, [userId, fetchPosts]);

  // ── Repost (optimistic) ──
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
      console.error("[useFeedV4] repost error:", err);
      fetchPosts(0, false);
    }
  }, [userId, fetchPosts]);

  // ── Bookmark / Save (optimistic) ──
  const bookmarkPost = useCallback(async (postId) => {
    if (!userId) return;
    const wasBookmarked = bookmarkedIds.has(postId);

    // Optimistic
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      wasBookmarked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, bookmarks_count: (p.bookmarks_count || 0) + (wasBookmarked ? -1 : 1) }
          : p
      )
    );

    try {
      if (wasBookmarked) {
        await supabase.from("bookmarks").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        const { error } = await supabase.from("bookmarks").insert({ post_id: postId, user_id: userId });
        if (error && error.code === "23505") return;
        if (error) throw error;
      }
    } catch (err) {
      console.error("[useFeedV4] bookmark error:", err);
      // Rollback
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        wasBookmarked ? next.add(postId) : next.delete(postId);
        return next;
      });
    }
  }, [userId, bookmarkedIds]);

  // ── Record view ──
  const recordView = useCallback(async (postId) => {
    if (!postId) return;
    try {
      await supabase.rpc("record_post_view", { p_post_id: postId, p_user_id: userId || null });
    } catch {
      // silent — view tracking is non-critical
    }
  }, [userId]);

  // ── Reply (with nested support) ──
  const replyToPost = useCallback(async (postId, content, parentReplyId = null) => {
    if (!userId || !content.trim()) return null;
    try {
      const insertData = {
        post_id: postId,
        user_id: userId,
        content: content.trim(),
      };
      if (parentReplyId) {
        insertData.parent_reply_id = parentReplyId;
        insertData.depth = 1; // simplified: max 1 level nesting
      }

      const { data, error } = await supabase
        .from("post_replies")
        .insert(insertData)
        .select("id, content, user_id, created_at, likes_count, is_pinned, parent_reply_id, depth, profiles:user_id(id, identity, avatar_url, level, xp, verified)")
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
      console.error("[useFeedV4] reply error:", err);
      return null;
    }
  }, [userId]);

  // ── Like reply ──
  const likeReply = useCallback(async (replyId) => {
    if (!userId) return;
    try {
      const { error } = await supabase.from("reply_likes").insert({ user_id: userId, reply_id: replyId });
      if (error && error.code === "23505") {
        // Already liked, unlike
        await supabase.from("reply_likes").delete().eq("reply_id", replyId).eq("user_id", userId);
      }
    } catch (err) {
      console.error("[useFeedV4] reply like error:", err);
    }
  }, [userId]);

  // ── Pin reply ──
  const pinReply = useCallback(async (postId, replyId) => {
    if (!userId) return;
    try {
      // Unpin all for this post first
      await supabase.from("post_replies").update({ is_pinned: false }).eq("post_id", postId);
      // Pin the target
      await supabase.from("post_replies").update({ is_pinned: true }).eq("id", replyId);
    } catch (err) {
      console.error("[useFeedV4] pin error:", err);
    }
  }, [userId]);

  // ── Delete post ──
  const deletePost = useCallback(async (postId) => {
    if (!userId) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      await supabase.from("posts").delete().eq("id", postId).eq("user_id", userId);
    } catch (err) {
      console.error("[useFeedV4] delete error:", err);
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
    bookmarkPost,
    bookmarkedIds,
    reportPost,
    createPost,
    deletePost,
    replyToPost,
    likeReply,
    pinReply,
    recordView,
    refresh: () => { pageRef.current = 0; fetchPosts(0, false); },
  };
}
