import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useCommunities — Communities 2.0 System Hook
 *
 * Provides:
 *  - Browse / search / sort / paginate communities
 *  - Create community with banner + avatar upload
 *  - Join / leave community
 *  - Community detail with insights, real-time, moderation
 *  - Post likes, comments, soft-delete, reporting
 *  - Role management, banning
 *  - Community XP + leaderboard
 */

const COMMUNITY_LEVELS = ["Learner", "Builder", "Operator", "Architect", "Authority"];
const PAGE_SIZE = 24;

export function getCommunityLevel(xp) {
  if (xp >= 5000) return COMMUNITY_LEVELS[4];
  if (xp >= 2000) return COMMUNITY_LEVELS[3];
  if (xp >= 750) return COMMUNITY_LEVELS[2];
  if (xp >= 200) return COMMUNITY_LEVELS[1];
  return COMMUNITY_LEVELS[0];
}

/* ═══════════════════════════════════════════════════
   useCommunityList — Browse + search + sort + infinite scroll
   ═══════════════════════════════════════════════════ */
export function useCommunityList(userId) {
  const [communities, setCommunities] = useState([]);
  const [myCommunities, setMyCommunities] = useState([]);
  const [recentPosts, setRecentPosts] = useState({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);

  const fetchMy = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from("community_members")
        .select("community_id, role, xp, level, communities(*)")
        .eq("user_id", userId);
      setMyCommunities(
        (data || []).map((m) => ({
          ...m.communities,
          myRole: m.role,
          myXP: m.xp,
          myLevel: m.level,
        }))
      );
    } catch (err) {
      console.error("[useCommunityList] fetchMy error:", err);
    }
  }, [userId]);

  const fetchCommunities = useCallback(
    async (sort = "members", search = "", pageNum = 0, append = false) => {
      if (!userId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let query = supabase.from("communities").select("*");

        if (search.trim()) {
          query = query.or(
            `name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,category.ilike.%${search.trim()}%`
          );
        }

        switch (sort) {
          case "active":
            query = query.order("posts_count", { ascending: false });
            break;
          case "newest":
            query = query.order("created_at", { ascending: false });
            break;
          case "members":
          default:
            query = query.order("members_count", { ascending: false });
            break;
        }

        query = query.range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        const { data, error } = await query;
        if (error) throw error;

        const list = data || [];
        setHasMore(list.length === PAGE_SIZE);

        if (append) {
          setCommunities((prev) => [...prev, ...list]);
        } else {
          setCommunities(list);
        }

        // Fetch 2 recent posts per community for preview
        const ids = list.map((c) => c.id);
        if (ids.length > 0) {
          const { data: posts } = await supabase
            .from("community_posts")
            .select("id, community_id, content, created_at")
            .in("community_id", ids)
            .or("is_deleted.is.null,is_deleted.eq.false")
            .order("created_at", { ascending: false })
            .limit(ids.length * 2);

          const grouped = {};
          for (const p of posts || []) {
            if (!grouped[p.community_id]) grouped[p.community_id] = [];
            if (grouped[p.community_id].length < 2) grouped[p.community_id].push(p);
          }
          setRecentPosts((prev) => (append ? { ...prev, ...grouped } : grouped));
        }
      } catch (err) {
        console.error("[useCommunityList] fetch error:", err);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    pageRef.current = 0;
    fetchCommunities();
    fetchMy();
  }, [fetchCommunities, fetchMy]);

  const search = useCallback(
    (term, sort = "members") => {
      pageRef.current = 0;
      fetchCommunities(sort, term, 0, false);
    },
    [fetchCommunities]
  );

  const loadMore = useCallback(
    (sort = "members", searchTerm = "") => {
      const next = pageRef.current + 1;
      pageRef.current = next;
      fetchCommunities(sort, searchTerm, next, true);
    },
    [fetchCommunities]
  );

  const createCommunity = useCallback(
    async ({ name, description, category, rules, isPrivate, bannerFile, avatarFile, tags }) => {
      if (!userId || !name.trim()) return null;
      const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      try {
        let banner_url = null;
        let icon_url = null;

        if (bannerFile) {
          const ext = bannerFile.name.split(".").pop();
          const path = `${userId}/banners/${slug}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from("post-media").upload(path, bannerFile);
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(path);
            banner_url = urlData?.publicUrl;
          }
        }

        if (avatarFile) {
          const ext = avatarFile.name.split(".").pop();
          const path = `${userId}/avatars/${slug}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from("post-media").upload(path, avatarFile);
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("post-media").getPublicUrl(path);
            icon_url = urlData?.publicUrl;
          }
        }

        const { data, error } = await supabase
          .from("communities")
          .insert({
            name: name.trim(),
            slug,
            description: description?.trim() || null,
            category: category || null,
            rules: rules?.trim() || null,
            is_private: isPrivate || false,
            owner_id: userId,
            banner_url,
            icon_url,
          })
          .select()
          .single();
        if (error) throw error;

        await supabase.from("community_members").insert({
          community_id: data.id,
          user_id: userId,
          role: "owner",
        });

        if (tags && tags.length > 0) {
          const tagRows = tags
            .map((t) => ({ community_id: data.id, tag: t.trim().toLowerCase() }))
            .filter((t) => t.tag);
          if (tagRows.length > 0) {
            await supabase.from("community_tags").insert(tagRows).catch(() => {});
          }
        }

        pageRef.current = 0;
        fetchCommunities();
        fetchMy();
        return data;
      } catch (err) {
        console.error("[useCommunityList] create error:", err);
        return null;
      }
    },
    [userId, fetchCommunities, fetchMy]
  );

  const joinCommunity = useCallback(
    async (communityId) => {
      if (!userId) return false;
      try {
        const { error } = await supabase.from("community_members").insert({
          community_id: communityId,
          user_id: userId,
          role: "member",
        });
        if (error && error.code !== "23505") throw error;
        setCommunities((prev) =>
          prev.map((c) =>
            c.id === communityId ? { ...c, members_count: (c.members_count || 0) + 1 } : c
          )
        );
        fetchMy();
        return true;
      } catch (err) {
        console.error("[useCommunityList] join error:", err);
        return false;
      }
    },
    [userId, fetchMy]
  );

  const leaveCommunity = useCallback(
    async (communityId) => {
      if (!userId) return false;
      try {
        await supabase
          .from("community_members")
          .delete()
          .eq("community_id", communityId)
          .eq("user_id", userId);
        setCommunities((prev) =>
          prev.map((c) =>
            c.id === communityId
              ? { ...c, members_count: Math.max((c.members_count || 1) - 1, 0) }
              : c
          )
        );
        fetchMy();
        return true;
      } catch (err) {
        console.error("[useCommunityList] leave error:", err);
        return false;
      }
    },
    [userId, fetchMy]
  );

  return {
    communities,
    myCommunities,
    recentPosts,
    loading,
    hasMore,
    createCommunity,
    joinCommunity,
    leaveCommunity,
    search,
    loadMore,
    refresh: () => {
      pageRef.current = 0;
      fetchCommunities();
      fetchMy();
    },
  };
}

/* ═══════════════════════════════════════════════════
   useCommunityDetail — Full community view + interactions
   ═══════════════════════════════════════════════════ */
export function useCommunityDetail(communityId, userId) {
  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [myLikes, setMyLikes] = useState(new Set());
  const [comments, setComments] = useState({});
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState({ postsToday: 0, topContributor: null });
  const [tags, setTags] = useState([]);
  const channelRef = useRef(null);

  const fetchDetail = useCallback(async () => {
    if (!communityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [commRes, membersRes, postsRes, tagsRes] = await Promise.all([
        supabase.from("communities").select("*").eq("id", communityId).single(),
        supabase
          .from("community_members")
          .select("*, profiles:user_id(id, identity, becoming, xp, level, streak, verified, avatar_url)")
          .eq("community_id", communityId)
          .order("xp", { ascending: false }),
        supabase
          .from("community_posts")
          .select("*, profiles:user_id(id, identity, becoming, level, verified, avatar_url)")
          .eq("community_id", communityId)
          .or("is_deleted.is.null,is_deleted.eq.false")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("community_tags")
          .select("tag")
          .eq("community_id", communityId),
      ]);

      setCommunity(commRes.data);
      setMembers(membersRes.data || []);
      setPosts(postsRes.data || []);
      setTags((tagsRes?.data || []).map((t) => t.tag));

      if (userId) {
        const me = (membersRes.data || []).find((m) => m.user_id === userId);
        setMyRole(me?.role || null);

        const postIds = (postsRes.data || []).map((p) => p.id);
        if (postIds.length > 0) {
          const { data: likeData } = await supabase
            .from("community_post_likes")
            .select("post_id")
            .eq("user_id", userId)
            .in("post_id", postIds);
          setMyLikes(new Set((likeData || []).map((l) => l.post_id)));
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const postsToday = (postsRes.data || []).filter(
        (p) => new Date(p.created_at) >= today
      ).length;
      const topMember = (membersRes.data || [])[0];
      setInsights({
        postsToday,
        topContributor: topMember
          ? { name: topMember.profiles?.identity || "User", xp: topMember.xp || 0 }
          : null,
      });
    } catch (err) {
      console.error("[useCommunityDetail] error:", err);
    } finally {
      setLoading(false);
    }
  }, [communityId, userId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Realtime
  useEffect(() => {
    if (!communityId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`community-v2-${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_posts",
          filter: `community_id=eq.${communityId}`,
        },
        (payload) => {
          if (payload.new.is_deleted) return;
          supabase
            .from("profiles")
            .select("id, identity, becoming, level, verified, avatar_url")
            .eq("id", payload.new.user_id)
            .single()
            .then(({ data: profile }) => {
              setPosts((prev) => {
                if (prev.some((p) => p.id === payload.new.id)) return prev;
                return [{ ...payload.new, profiles: profile }, ...prev];
              });
            });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_members",
          filter: `community_id=eq.${communityId}`,
        },
        () => fetchDetail()
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [communityId, fetchDetail]);

  const createPost = useCallback(
    async (content) => {
      if (!userId || !communityId || !content.trim()) return null;
      try {
        const { data, error } = await supabase
          .from("community_posts")
          .insert({
            community_id: communityId,
            user_id: userId,
            content: content.trim(),
            type: "post",
          })
          .select("*, profiles:user_id(id, identity, becoming, level, verified, avatar_url)")
          .single();
        if (error) throw error;

        await supabase
          .rpc("increment_community_xp", {
            p_community_id: communityId,
            p_user_id: userId,
            p_xp: 3,
          })
          .catch(() => {});

        return data;
      } catch (err) {
        console.error("[useCommunityDetail] post error:", err);
        return null;
      }
    },
    [userId, communityId]
  );

  const likePost = useCallback(
    async (postId) => {
      if (!userId) return;
      const liked = myLikes.has(postId);

      setMyLikes((prev) => {
        const next = new Set(prev);
        if (liked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, like_count: (p.like_count || 0) + (liked ? -1 : 1) }
            : p
        )
      );

      try {
        if (liked) {
          await supabase
            .from("community_post_likes")
            .delete()
            .eq("user_id", userId)
            .eq("post_id", postId);
        } else {
          await supabase
            .from("community_post_likes")
            .insert({ user_id: userId, post_id: postId });
          const post = posts.find((p) => p.id === postId);
          if (post && post.user_id !== userId) {
            await supabase
              .rpc("increment_community_xp", {
                p_community_id: communityId,
                p_user_id: post.user_id,
                p_xp: 1,
              })
              .catch(() => {});
          }
        }
      } catch (err) {
        setMyLikes((prev) => {
          const next = new Set(prev);
          if (liked) next.add(postId);
          else next.delete(postId);
          return next;
        });
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, like_count: (p.like_count || 0) + (liked ? 1 : -1) }
              : p
          )
        );
        console.error("[useCommunityDetail] like error:", err);
      }
    },
    [userId, communityId, myLikes, posts]
  );

  const fetchComments = useCallback(async (postId) => {
    try {
      const { data } = await supabase
        .from("community_post_comments")
        .select("*, profiles:user_id(id, identity, level, verified, avatar_url)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(50);
      setComments((prev) => ({ ...prev, [postId]: data || [] }));
    } catch (err) {
      console.error("[useCommunityDetail] fetchComments error:", err);
    }
  }, []);

  const addComment = useCallback(
    async (postId, content) => {
      if (!userId || !content.trim()) return null;
      try {
        const { data, error } = await supabase
          .from("community_post_comments")
          .insert({ post_id: postId, user_id: userId, content: content.trim() })
          .select("*, profiles:user_id(id, identity, level, verified, avatar_url)")
          .single();
        if (error) throw error;

        setComments((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []), data],
        }));
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p
          )
        );

        await supabase
          .rpc("increment_community_xp", {
            p_community_id: communityId,
            p_user_id: userId,
            p_xp: 2,
          })
          .catch(() => {});

        return data;
      } catch (err) {
        console.error("[useCommunityDetail] comment error:", err);
        return null;
      }
    },
    [userId, communityId]
  );

  const deletePost = useCallback(
    async (postId, reason = "") => {
      try {
        await supabase
          .from("community_posts")
          .update({ is_deleted: true, deleted_by: userId })
          .eq("id", postId);
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        await supabase
          .from("community_moderation_log")
          .insert({
            community_id: communityId,
            moderator_id: userId,
            action: "delete_post",
            target_post_id: postId,
            reason,
          })
          .catch(() => {});
      } catch (err) {
        console.error("[useCommunityDetail] delete error:", err);
      }
    },
    [communityId, userId]
  );

  const reportPost = useCallback(
    async (postId, reason = "spam") => {
      try {
        await supabase.from("community_moderation_log").insert({
          community_id: communityId,
          moderator_id: userId,
          action: "report",
          target_post_id: postId,
          reason,
        });
        return true;
      } catch (err) {
        console.error("[useCommunityDetail] report error:", err);
        return false;
      }
    },
    [communityId, userId]
  );

  const updateRole = useCallback(
    async (targetUserId, newRole) => {
      try {
        await supabase.rpc("update_member_role", {
          p_community_id: communityId,
          p_target_user_id: targetUserId,
          p_new_role: newRole,
        });
        await supabase
          .from("community_moderation_log")
          .insert({
            community_id: communityId,
            moderator_id: userId,
            action: "role_change",
            target_user_id: targetUserId,
            reason: `Changed to ${newRole}`,
          })
          .catch(() => {});
        fetchDetail();
      } catch (err) {
        console.error("[useCommunityDetail] role error:", err);
      }
    },
    [communityId, userId, fetchDetail]
  );

  const banUser = useCallback(
    async (targetUserId, reason = "", isPermanent = false) => {
      if (!communityId) return;
      try {
        await supabase.from("community_bans").upsert({
          community_id: communityId,
          user_id: targetUserId,
          banned_by: userId,
          reason,
          is_permanent: isPermanent,
          expires_at: isPermanent ? null : new Date(Date.now() + 7 * 86400000).toISOString(),
        });
        await supabase
          .from("community_members")
          .delete()
          .eq("community_id", communityId)
          .eq("user_id", targetUserId);
        await supabase.from("strikes").insert({
          user_id: targetUserId,
          reason: reason || "Community ban",
          community_id: communityId,
          issued_by: userId,
        });
        await supabase
          .from("community_moderation_log")
          .insert({
            community_id: communityId,
            moderator_id: userId,
            action: "ban",
            target_user_id: targetUserId,
            reason,
          })
          .catch(() => {});
        fetchDetail();
      } catch (err) {
        console.error("[useCommunityDetail] ban error:", err);
      }
    },
    [communityId, userId, fetchDetail]
  );

  const joinCommunity = useCallback(async () => {
    if (!userId || !communityId) return false;
    try {
      const { error } = await supabase.from("community_members").insert({
        community_id: communityId,
        user_id: userId,
        role: "member",
      });
      if (error && error.code !== "23505") throw error;
      fetchDetail();
      return true;
    } catch (err) {
      console.error("[useCommunityDetail] join error:", err);
      return false;
    }
  }, [userId, communityId, fetchDetail]);

  const leaveCommunity = useCallback(async () => {
    if (!userId || !communityId) return false;
    try {
      await supabase
        .from("community_members")
        .delete()
        .eq("community_id", communityId)
        .eq("user_id", userId);
      fetchDetail();
      return true;
    } catch (err) {
      console.error("[useCommunityDetail] leave error:", err);
      return false;
    }
  }, [userId, communityId, fetchDetail]);

  const sortPosts = useCallback((sortBy) => {
    setPosts((prev) => {
      const sorted = [...prev];
      switch (sortBy) {
        case "top":
          sorted.sort(
            (a, b) =>
              (b.like_count || 0) * 3 +
              (b.comment_count || 0) * 4 -
              ((a.like_count || 0) * 3 + (a.comment_count || 0) * 4)
          );
          break;
        case "trending":
          sorted.sort((a, b) => {
            const sa =
              (a.like_count || 0) * 3 +
              (a.comment_count || 0) * 4 -
              ((Date.now() - new Date(a.created_at).getTime()) / 3600000) * 0.2;
            const sb =
              (b.like_count || 0) * 3 +
              (b.comment_count || 0) * 4 -
              ((Date.now() - new Date(b.created_at).getTime()) / 3600000) * 0.2;
            return sb - sa;
          });
          break;
        case "new":
        default:
          sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          break;
      }
      return sorted;
    });
  }, []);

  return {
    community,
    members,
    posts,
    myRole,
    myLikes,
    comments,
    loading,
    insights,
    tags,
    createPost,
    likePost,
    fetchComments,
    addComment,
    deletePost,
    reportPost,
    updateRole,
    banUser,
    joinCommunity,
    leaveCommunity,
    sortPosts,
    refresh: fetchDetail,
  };
}
