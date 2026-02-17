import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";

/**
 * useProfilePage — Full Profile analytics + social hook
 *
 * Provides:
 *  - Profile data (hero stats, bio, verification)
 *  - Posts feed (own posts with like/reply/repost interaction)
 *  - Focus logs (from focus_sessions + checkins)
 *  - Achievements (derived milestones)
 *  - Stats (heatmap, XP curve, focus distribution)
 *  - Social actions (like, reply, repost, post creation)
 */

/* ── Level helpers ── */
const levelFromXP = (xp) => Math.floor(Math.sqrt(xp / 50));
const xpForLevel = (level) => Math.pow(level, 2) * 50;

const LEVEL_TITLES = [
  "Newcomer",        // 0
  "Initiate",        // 1
  "Apprentice",      // 2
  "Disciple",        // 3
  "Builder",         // 4
  "Sentinel",        // 5
  "Architect",       // 6
  "Commander",       // 7
  "Master",          // 8
  "Sovereign",       // 9
  "Apex",            // 10+
];

export function getLevelTitle(level) {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length - 1)];
}

/* ── Verification logic ── */
function computeVerification(profile, totalFocusHours, longestStreak) {
  const hours = totalFocusHours || profile?.total_focus_hours || 0;
  const streak = longestStreak || profile?.streak || 0;
  const isVerified = profile?.verified || hours >= 100 || streak >= 30;
  let badgeType = profile?.badge_type || null;
  if (!badgeType && isVerified) {
    if (hours >= 100) badgeType = "centurion";
    else if (streak >= 30) badgeType = "iron_streak";
  }
  return { isVerified, badgeType };
}

/* ── Achievement definitions ── */
const ACHIEVEMENT_DEFS = [
  { id: "first_checkin",     label: "First Check-In",        icon: "✓", test: (s) => s.totalCheckins >= 1 },
  { id: "streak_3",          label: "3-Day Streak",          icon: "🔥", test: (s) => s.longestStreak >= 3 },
  { id: "streak_7",          label: "Weekly Warrior",        icon: "⚡", test: (s) => s.longestStreak >= 7 },
  { id: "streak_14",         label: "Two-Week Titan",        icon: "💎", test: (s) => s.longestStreak >= 14 },
  { id: "streak_30",         label: "Iron Discipline",       icon: "🛡️", test: (s) => s.longestStreak >= 30 },
  { id: "streak_100",        label: "Century Streak",        icon: "👑", test: (s) => s.longestStreak >= 100 },
  { id: "xp_500",            label: "XP Apprentice",         icon: "⭐", test: (s) => s.totalXP >= 500 },
  { id: "xp_2500",           label: "XP Architect",          icon: "🌟", test: (s) => s.totalXP >= 2500 },
  { id: "xp_10000",          label: "XP Sovereign",          icon: "💫", test: (s) => s.totalXP >= 10000 },
  { id: "focus_10h",         label: "10 Hours Focused",      icon: "🎯", test: (s) => s.totalHours >= 10 },
  { id: "focus_50h",         label: "50 Hours Focused",      icon: "🔷", test: (s) => s.totalHours >= 50 },
  { id: "focus_100h",        label: "Centurion",             icon: "🏆", test: (s) => s.totalHours >= 100 },
  { id: "level_5",           label: "Level 5 Reached",       icon: "📈", test: (s) => s.level >= 5 },
  { id: "level_10",          label: "Double Digits",         icon: "🚀", test: (s) => s.level >= 10 },
  { id: "checkins_50",       label: "50 Check-Ins",          icon: "📋", test: (s) => s.totalCheckins >= 50 },
  { id: "checkins_100",      label: "Century Builder",       icon: "🏛️", test: (s) => s.totalCheckins >= 100 },
];

export function useProfilePage(userId) {
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [focusLogs, setFocusLogs] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [stats, setStats] = useState(null);
  const [myLikes, setMyLikes] = useState(new Set());
  const [myReposts, setMyReposts] = useState(new Set());
  const [postingLoading, setPostingLoading] = useState(false);

  // ── Rank computation ──
  const fetchRank = useCallback(async (userXP) => {
    try {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("xp", userXP);
      return (count || 0) + 1;
    } catch {
      return null;
    }
  }, []);

  // ── Focus score: composite of streak consistency + focus hours ──
  const computeFocusScore = useCallback((streakDays, totalHours, totalCheckins) => {
    const streakScore = Math.min(streakDays / 30, 1) * 40;     // 40 pts max
    const hoursScore = Math.min(totalHours / 100, 1) * 35;     // 35 pts max
    const consistencyScore = Math.min(totalCheckins / 100, 1) * 25; // 25 pts max
    return Math.round(streakScore + hoursScore + consistencyScore);
  }, []);

  // ═══════ MAIN FETCH ═══════
  const fetchProfile = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);

      // ── Parallel fetches ──
      const [profileRes, checkinsRes, sessionsRes, postsRes, rankHistoryRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single(),
        supabase
          .from("checkins")
          .select("id, date, minutes_worked, completed, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("focus_sessions")
          .select("id, duration, xp_earned, session_date, focus_name, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("posts")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("rank_history")
          .select("rank, xp, recorded_at")
          .eq("user_id", userId)
          .order("recorded_at", { ascending: true }),
      ]);

      const p = profileRes.data;
      if (!p) { setLoading(false); return; }

      const checkins = checkinsRes.data || [];
      const sessions = sessionsRes.data || [];
      const rawPosts = postsRes.data || [];
      const rankHistory = rankHistoryRes.data || [];

      // ── Total focus hours from sessions ──
      const totalSessionMinutes = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
      const totalFocusHours = Math.round((totalSessionMinutes / 60) * 10) / 10;

      // ── Longest streak ──
      let longestStreak = 0;
      let runStreak = 0;
      let prevDate = null;
      const sortedDates = checkins.map(c => c.date).filter(Boolean).sort();
      for (const dateStr of sortedDates) {
        if (prevDate) {
          const prev = new Date(prevDate + "T00:00:00");
          const curr = new Date(dateStr + "T00:00:00");
          const diff = (curr - prev) / 86400000;
          runStreak = diff === 1 ? runStreak + 1 : 1;
        } else {
          runStreak = 1;
        }
        longestStreak = Math.max(longestStreak, runStreak);
        prevDate = dateStr;
      }

      // ── XP progress ──
      const level = levelFromXP(p.xp || 0);
      const currentLevelXP = xpForLevel(level);
      const nextLevelXP = xpForLevel(level + 1);
      const xpInLevel = (p.xp || 0) - currentLevelXP;
      const xpNeeded = nextLevelXP - currentLevelXP;
      const xpPct = Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));

      // ── Rank ──
      const rank = await fetchRank(p.xp || 0);

      // ── Focus score ──
      const focusScore = computeFocusScore(p.streak || 0, totalFocusHours, checkins.length);

      // ── Verification ──
      const { isVerified, badgeType } = computeVerification(p, totalFocusHours, longestStreak);

      // ── Member since ──
      const memberSince = p.created_at
        ? new Date(p.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : null;

      // ── Set profile data ──
      setProfileData({
        id: p.id,
        identity: p.identity || "Anonymous",
        becoming: p.becoming || null,
        focus: p.focus || null,
        bio: p.bio || null,
        discipline: p.discipline || null,
        missionStatement: p.mission_statement || null,
        avatarUrl: p.avatar_url || null,
        xp: p.xp || 0,
        level,
        levelTitle: getLevelTitle(level),
        xpInLevel,
        xpNeeded,
        xpPct,
        streak: p.streak || 0,
        longestStreak,
        totalFocusHours,
        focusScore,
        rank,
        totalCheckins: checkins.length,
        isVerified,
        badgeType,
        isPrivate: p.is_private || false,
        followersCount: p.followers_count || 0,
        followingCount: p.following_count || 0,
        country: p.country || null,
        city: p.city || null,
        location: p.location || null,
        memberSince,
        commitmentLevel: p.commitment_level || null,
      });

      // ── Posts ──
      setPosts(rawPosts);

      // ── Focus logs ──
      const logs = sessions.map((s) => ({
        id: s.id,
        focusName: s.focus_name || "Focus Session",
        duration: s.duration || 0,
        xpEarned: s.xp_earned || 0,
        date: s.session_date || s.created_at?.split("T")[0],
        createdAt: s.created_at,
      }));
      setFocusLogs(logs);

      // ── Achievements ──
      const milestoneStats = {
        totalCheckins: checkins.length,
        longestStreak,
        totalXP: p.xp || 0,
        totalHours: totalFocusHours,
        level,
      };
      const earned = ACHIEVEMENT_DEFS.filter((a) => a.test(milestoneStats)).map((a) => ({
        id: a.id,
        label: a.label,
        icon: a.icon,
        earned: true,
      }));
      const locked = ACHIEVEMENT_DEFS.filter((a) => !a.test(milestoneStats)).map((a) => ({
        id: a.id,
        label: a.label,
        icon: a.icon,
        earned: false,
      }));
      setAchievements([...earned, ...locked]);

      // ── Stats ──
      // 30-day heatmap
      const heatmap = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const dayCheckins = checkins.filter((c) => c.date === ds);
        const daySessions = sessions.filter((s) => (s.session_date || s.created_at?.split("T")[0]) === ds);
        const totalMin = daySessions.reduce((s, x) => s + (x.duration || 0), 0) +
                          dayCheckins.reduce((s, x) => s + (x.minutes_worked || 0), 0);
        heatmap.push({ date: ds, minutes: totalMin, active: totalMin > 0 });
      }

      // XP curve (cumulative from rank_history or live_activity)
      let xpCurve = [];
      if (rankHistory.length > 0) {
        xpCurve = rankHistory.map((r) => ({ date: r.recorded_at, xp: r.xp }));
      } else {
        // Fallback: build from checkins
        let cumXP = 0;
        const seen = new Set();
        for (const c of checkins) {
          if (!c.date || seen.has(c.date)) continue;
          seen.add(c.date);
          cumXP += 25; // approximate XP per checkin
          xpCurve.push({ date: c.date, xp: cumXP });
        }
      }

      setStats({ heatmap, xpCurve });

      // ── Fetch my interactions (likes + reposts) ──
      if (rawPosts.length > 0) {
        const postIds = rawPosts.map((p) => p.id);
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
        setMyLikes(new Set((likesRes.data || []).map((l) => l.post_id)));
        setMyReposts(new Set((repostsRes.data || []).map((r) => r.post_id)));
      }
    } catch (err) {
      console.error("[useProfilePage] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, fetchRank, computeFocusScore]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ═══════ SOCIAL ACTIONS ═══════

  // ── Create post ──
  const createPost = useCallback(async (type, content) => {
    if (!userId || !content.trim()) return null;
    setPostingLoading(true);
    try {
      const { data, error } = await supabase
        .from("posts")
        .insert({ user_id: userId, type, content: content.trim() })
        .select()
        .single();
      if (error) throw error;
      setPosts((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      console.error("[useProfilePage] post error:", err);
      return null;
    } finally {
      setPostingLoading(false);
    }
  }, [userId]);

  // ── Delete post ──
  const deletePost = useCallback(async (postId) => {
    try {
      await supabase.from("posts").delete().eq("id", postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error("[useProfilePage] delete error:", err);
    }
  }, []);

  // ── Toggle like ──
  const toggleLike = useCallback(async (postId) => {
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
      console.error("[useProfilePage] like error:", err);
      // Revert
      setMyLikes((prev) => {
        const next = new Set(prev);
        alreadyLiked ? next.add(postId) : next.delete(postId);
        return next;
      });
      fetchProfile();
    }
  }, [userId, myLikes, fetchProfile]);

  // ── Toggle repost ──
  const toggleRepost = useCallback(async (postId) => {
    if (!userId) return;
    const alreadyReposted = myReposts.has(postId);
    // Optimistic
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
      console.error("[useProfilePage] repost error:", err);
      setMyReposts((prev) => {
        const next = new Set(prev);
        alreadyReposted ? next.add(postId) : next.delete(postId);
        return next;
      });
      fetchProfile();
    }
  }, [userId, myReposts, fetchProfile]);

  return {
    loading,
    profileData,
    posts,
    focusLogs,
    achievements,
    stats,
    myLikes,
    myReposts,
    postingLoading,
    createPost,
    deletePost,
    toggleLike,
    toggleRepost,
    refresh: fetchProfile,
  };
}
