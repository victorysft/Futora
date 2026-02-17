import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useCommunities — Community system hook
 *
 * Provides:
 *  - Browse/search communities
 *  - Create community
 *  - Join/leave community
 *  - Community detail (members, posts, leaderboard)
 *  - Role management
 */

const COMMUNITY_LEVELS = ["Learner", "Builder", "Operator", "Architect", "Authority"];

export function getCommunityLevel(xp) {
  if (xp >= 5000) return COMMUNITY_LEVELS[4];
  if (xp >= 2000) return COMMUNITY_LEVELS[3];
  if (xp >= 750) return COMMUNITY_LEVELS[2];
  if (xp >= 200) return COMMUNITY_LEVELS[1];
  return COMMUNITY_LEVELS[0];
}

/* ═══════════════════════════════════════════════════
   useCommunityList — Browse + search communities
   ═══════════════════════════════════════════════════ */
export function useCommunityList(userId) {
  const [communities, setCommunities] = useState([]);
  const [myCommunities, setMyCommunities] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [allRes, myRes] = await Promise.all([
        supabase
          .from("communities")
          .select("*")
          .order("members_count", { ascending: false })
          .limit(50),
        supabase
          .from("community_members")
          .select("community_id, role, xp, level, communities(*)")
          .eq("user_id", userId),
      ]);

      setCommunities(allRes.data || []);
      setMyCommunities((myRes.data || []).map((m) => ({
        ...m.communities,
        myRole: m.role,
        myXP: m.xp,
        myLevel: m.level,
      })));
    } catch (err) {
      console.error("[useCommunityList] error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Create community ──
  const createCommunity = useCallback(async ({ name, description, category, rules, isPrivate }) => {
    if (!userId || !name.trim()) return null;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    try {
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
        })
        .select()
        .single();
      if (error) throw error;

      // Auto-join as owner
      await supabase.from("community_members").insert({
        community_id: data.id,
        user_id: userId,
        role: "owner",
      });

      fetchAll();
      return data;
    } catch (err) {
      console.error("[useCommunityList] create error:", err);
      return null;
    }
  }, [userId, fetchAll]);

  // ── Join community ──
  const joinCommunity = useCallback(async (communityId) => {
    if (!userId) return false;
    try {
      const { error } = await supabase.from("community_members").insert({
        community_id: communityId,
        user_id: userId,
        role: "member",
      });
      if (error && error.code !== "23505") throw error;
      fetchAll();
      return true;
    } catch (err) {
      console.error("[useCommunityList] join error:", err);
      return false;
    }
  }, [userId, fetchAll]);

  // ── Leave community ──
  const leaveCommunity = useCallback(async (communityId) => {
    if (!userId) return false;
    try {
      await supabase
        .from("community_members")
        .delete()
        .eq("community_id", communityId)
        .eq("user_id", userId);
      fetchAll();
      return true;
    } catch (err) {
      console.error("[useCommunityList] leave error:", err);
      return false;
    }
  }, [userId, fetchAll]);

  return {
    communities,
    myCommunities,
    loading,
    createCommunity,
    joinCommunity,
    leaveCommunity,
    refresh: fetchAll,
  };
}

/* ═══════════════════════════════════════════════════
   useCommunityDetail — Single community view
   ═══════════════════════════════════════════════════ */
export function useCommunityDetail(communityId, userId) {
  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchDetail = useCallback(async () => {
    if (!communityId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [commRes, membersRes, postsRes] = await Promise.all([
        supabase
          .from("communities")
          .select("*")
          .eq("id", communityId)
          .single(),
        supabase
          .from("community_members")
          .select("*, profiles:user_id(id, identity, becoming, xp, level, streak, verified)")
          .eq("community_id", communityId)
          .order("xp", { ascending: false }),
        supabase
          .from("community_posts")
          .select("*, profiles:user_id(id, identity, becoming, level, verified)")
          .eq("community_id", communityId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setCommunity(commRes.data);
      setMembers(membersRes.data || []);
      setPosts(postsRes.data || []);

      // Find my role
      if (userId) {
        const me = (membersRes.data || []).find((m) => m.user_id === userId);
        setMyRole(me?.role || null);
      }
    } catch (err) {
      console.error("[useCommunityDetail] error:", err);
    } finally {
      setLoading(false);
    }
  }, [communityId, userId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Realtime for community posts
  useEffect(() => {
    if (!communityId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`community-${communityId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_posts", filter: `community_id=eq.${communityId}` },
        (payload) => {
          supabase
            .from("profiles")
            .select("id, identity, becoming, level, verified")
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
  }, [communityId]);

  // ── Post in community ──
  const createPost = useCallback(async (type, content) => {
    if (!userId || !communityId || !content.trim()) return null;
    try {
      const { data, error } = await supabase
        .from("community_posts")
        .insert({
          community_id: communityId,
          user_id: userId,
          type,
          content: content.trim(),
        })
        .select()
        .single();
      if (error) throw error;

      // Award community XP (+3 per post)
      await supabase.rpc("increment_community_xp", {
        p_community_id: communityId,
        p_user_id: userId,
        p_xp: 3,
      }).catch(() => {
        // Fallback if RPC doesn't exist yet
        supabase
          .from("community_members")
          .select("xp")
          .eq("community_id", communityId)
          .eq("user_id", userId)
          .single()
          .then(({ data: mem }) => {
            if (mem) {
              const newXP = (mem.xp || 0) + 3;
              supabase
                .from("community_members")
                .update({ xp: newXP })
                .eq("community_id", communityId)
                .eq("user_id", userId);
            }
          });
      });

      return data;
    } catch (err) {
      console.error("[useCommunityDetail] post error:", err);
      return null;
    }
  }, [userId, communityId]);

  // ── Delete post (own or mod/admin/owner) ──
  const deletePost = useCallback(async (postId) => {
    try {
      await supabase.from("community_posts").delete().eq("id", postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error("[useCommunityDetail] delete error:", err);
    }
  }, []);

  // ── Update member role ──
  const updateRole = useCallback(async (targetUserId, newRole) => {
    try {
      await supabase.rpc("update_member_role", {
        p_community_id: communityId,
        p_target_user_id: targetUserId,
        p_new_role: newRole,
      });
      fetchDetail();
    } catch (err) {
      console.error("[useCommunityDetail] role error:", err);
    }
  }, [communityId, fetchDetail]);

  // ── Ban user ──
  const banUser = useCallback(async (targetUserId, reason = "", isPermanent = false) => {
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
      // Remove from members
      await supabase
        .from("community_members")
        .delete()
        .eq("community_id", communityId)
        .eq("user_id", targetUserId);

      // Issue strike
      await supabase.from("strikes").insert({
        user_id: targetUserId,
        reason: reason || "Community ban",
        community_id: communityId,
        issued_by: userId,
      });

      fetchDetail();
    } catch (err) {
      console.error("[useCommunityDetail] ban error:", err);
    }
  }, [communityId, userId, fetchDetail]);

  return {
    community,
    members,
    posts,
    myRole,
    loading,
    createPost,
    deletePost,
    updateRole,
    banUser,
    refresh: fetchDetail,
  };
}
