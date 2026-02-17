import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";

/* ═══════════════════════════════════════════
   MOMENTUM TIER SYSTEM
   Cold → Warming → Building → On Fire → Unstoppable
   Based on streak + weekly completion %
   ═══════════════════════════════════════════ */
const MOMENTUM_TIERS = [
  { key: "cold",        label: "Cold",         minScore: 0,   color: "#64748B" },
  { key: "warming",     label: "Warming Up",   minScore: 15,  color: "#F59E0B" },
  { key: "building",    label: "Building",     minScore: 35,  color: "#F97316" },
  { key: "on-fire",     label: "On Fire",      minScore: 60,  color: "#EF4444" },
  { key: "unstoppable", label: "Unstoppable",  minScore: 85,  color: "#A78BFA" },
];

function getMomentumTier(streak, weeklyCompletion) {
  // Score: 40% streak weight (capped at 30 days) + 60% weekly completion
  const streakScore = Math.min(streak, 30) / 30 * 40;
  const weekScore   = Math.min(weeklyCompletion, 100) / 100 * 60;
  const score       = streakScore + weekScore;

  let tier = MOMENTUM_TIERS[0];
  for (const t of MOMENTUM_TIERS) {
    if (score >= t.minScore) tier = t;
  }
  return { ...tier, score: Math.round(score) };
}

/* XP rewards */
const TASK_COMPLETE_XP = 15;
const COOLDOWN_DAYS    = 7;

/**
 * useFocus — Full Focus Command Center data hook
 *
 * Provides:
 *  - Active focus + 7-day switching cooldown
 *  - Today's tasks (top 3) with XP on completion
 *  - Momentum tier (Cold → Unstoppable)
 *  - Weekly completion engine
 *  - CRUD operations fully wired to Supabase
 */
export function useFocus(userId) {
  const [focus, setFocus] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalMinutes: 0,
    totalXP: 0,
    weekMinutes: 0,
    weekSessions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastArchivedAt, setLastArchivedAt] = useState(null);
  const [xpToast, setXpToast] = useState(null); // { amount, taskTitle }
  const [error, setError] = useState(null);

  // ─── Helpers ───
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const weekStartStr = useMemo(() => {
    const d = new Date();
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().slice(0, 10);
  }, []);

  // ─── Fetch active focus ───
  const fetchFocus = useCallback(async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("user_focuses")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("is_archived", false)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[useFocus] fetch error:", error);
    }
    return data;
  }, [userId]);

  // ─── Fetch last archived focus date (for cooldown) ───
  const fetchLastArchived = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from("user_focuses")
      .select("updated_at")
      .eq("user_id", userId)
      .eq("is_archived", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.updated_at || null;
  }, [userId]);

  // ─── Fetch today's tasks ───
  const fetchTasks = useCallback(async (focusId) => {
    if (!focusId || !userId) return [];
    const { data, error } = await supabase
      .from("focus_tasks")
      .select("*")
      .eq("focus_id", focusId)
      .eq("user_id", userId)
      .eq("task_date", todayStr)
      .order("sort_order", { ascending: true })
      .limit(3);

    if (error) {
      console.error("[useFocus] tasks error:", error);
      return [];
    }
    return data || [];
  }, [userId, todayStr]);

  // ─── Fetch stats ───
  const fetchStats = useCallback(async (focusId) => {
    if (!focusId || !userId) {
      return { totalSessions: 0, totalMinutes: 0, totalXP: 0, weekMinutes: 0, weekSessions: 0 };
    }

    const [{ data: allSessions }, { data: weekSessions }] = await Promise.all([
      supabase
        .from("focus_sessions")
        .select("duration, xp_earned")
        .eq("focus_id", focusId)
        .eq("user_id", userId),
      supabase
        .from("focus_sessions")
        .select("duration")
        .eq("focus_id", focusId)
        .eq("user_id", userId)
        .gte("session_date", weekStartStr),
    ]);

    const all = allSessions || [];
    const week = weekSessions || [];

    return {
      totalSessions: all.length,
      totalMinutes: all.reduce((sum, s) => sum + (s.duration || 0), 0),
      totalXP: all.reduce((sum, s) => sum + (s.xp_earned || 0), 0),
      weekMinutes: week.reduce((sum, s) => sum + (s.duration || 0), 0),
      weekSessions: week.length,
    };
  }, [userId, weekStartStr]);

  // ─── Initial load ───
  const loadAll = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [f, archivedAt] = await Promise.all([fetchFocus(), fetchLastArchived()]);
      setFocus(f);
      setLastArchivedAt(archivedAt);
      if (f) {
        const [t, s] = await Promise.all([fetchTasks(f.id), fetchStats(f.id)]);
        setTasks(t);
        setStats(s);
      } else {
        setTasks([]);
        setStats({ totalSessions: 0, totalMinutes: 0, totalXP: 0, weekMinutes: 0, weekSessions: 0 });
      }
    } catch (err) {
      console.error("[useFocus] loadAll error:", err);
      setError(err?.message || "Failed to load focus data. Have you run the focus migration SQL?");
    } finally {
      setLoading(false);
    }
  }, [userId, fetchFocus, fetchLastArchived, fetchTasks, fetchStats]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Cooldown check ───
  const cooldownRemaining = useMemo(() => {
    if (!lastArchivedAt) return 0;
    const archived = new Date(lastArchivedAt);
    const unlockDate = new Date(archived.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysLeft = Math.ceil((unlockDate - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysLeft);
  }, [lastArchivedAt]);

  const canCreateFocus = useMemo(() => {
    return !focus && cooldownRemaining <= 0;
  }, [focus, cooldownRemaining]);

  // ─── Create focus ───
  const createFocus = useCallback(async (fields) => {
    if (!userId) {
      setError("Not authenticated. Please sign in again.");
      return null;
    }
    if (cooldownRemaining > 0) {
      console.warn("[useFocus] Cannot create — cooldown active:", cooldownRemaining, "days left");
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      // Deactivate any existing active focus
      await supabase
        .from("user_focuses")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("is_active", true);

      const { data, error } = await supabase
        .from("user_focuses")
        .insert({
          user_id: userId,
          title: fields.title || "Untitled Focus",
          becoming_role: fields.becoming_role || "",
          mission_statement: fields.mission_statement || "",
          start_date: fields.start_date || todayStr,
          target_end_date: fields.target_end_date || null,
          weekly_hours_target: fields.weekly_hours_target || 10,
          privacy: fields.privacy || "public",
        })
        .select()
        .single();

      if (error) throw error;
      setFocus(data);
      setTasks([]);
      setStats({ totalSessions: 0, totalMinutes: 0, totalXP: 0, weekMinutes: 0, weekSessions: 0 });
      return data;
    } catch (err) {
      console.error("[useFocus] create error:", err);
      const msg = err?.message || String(err);
      if (msg.includes("relation") && msg.includes("does not exist")) {
        setError("Table 'user_focuses' not found. Run supabase_focus_migration.sql in your Supabase SQL editor first.");
      } else {
        setError("Failed to create focus: " + msg);
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [userId, todayStr, cooldownRemaining]);

  // ─── Update focus ───
  const updateFocus = useCallback(async (fields) => {
    if (!focus?.id) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("user_focuses")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", focus.id)
        .select()
        .single();

      if (error) throw error;
      setFocus(data);
      return data;
    } catch (err) {
      console.error("[useFocus] update error:", err);
      return null;
    } finally {
      setSaving(false);
    }
  }, [focus?.id]);

  // ─── Archive focus (with cooldown trigger) ───
  const archiveFocus = useCallback(async () => {
    if (!focus?.id) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await supabase
        .from("user_focuses")
        .update({ is_archived: true, is_active: false, updated_at: now })
        .eq("id", focus.id);

      setFocus(null);
      setTasks([]);
      setStats({ totalSessions: 0, totalMinutes: 0, totalXP: 0, weekMinutes: 0, weekSessions: 0 });
      setLastArchivedAt(now);
    } catch (err) {
      console.error("[useFocus] archive error:", err);
    } finally {
      setSaving(false);
    }
  }, [focus?.id]);

  // ─── Award XP to profile ───
  const awardXP = useCallback(async (amount) => {
    if (!userId || amount <= 0) return;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("xp")
        .eq("id", userId)
        .single();

      if (profile) {
        await supabase
          .from("profiles")
          .update({ xp: (profile.xp || 0) + amount })
          .eq("id", userId);
      }
    } catch (err) {
      console.error("[useFocus] awardXP error:", err);
    }
  }, [userId]);

  // ─── Task CRUD ───
  const addTask = useCallback(async (title, timeEstimate = null) => {
    if (!focus?.id || !userId) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("focus_tasks")
        .insert({
          focus_id: focus.id,
          user_id: userId,
          title,
          time_estimate: timeEstimate,
          sort_order: tasks.length,
          task_date: todayStr,
        })
        .select()
        .single();

      if (error) throw error;
      setTasks((prev) => [...prev, data]);
      return data;
    } catch (err) {
      console.error("[useFocus] addTask error:", err);
      return null;
    } finally {
      setSaving(false);
    }
  }, [focus?.id, userId, tasks.length, todayStr]);

  const updateTask = useCallback(async (taskId, fields) => {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("focus_tasks")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .select()
        .single();

      if (error) throw error;
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data : t)));
      return data;
    } catch (err) {
      console.error("[useFocus] updateTask error:", err);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  const removeTask = useCallback(async (taskId) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("focus_tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error("[useFocus] removeTask error:", err);
    } finally {
      setSaving(false);
    }
  }, []);

  // ─── Toggle task with XP reward ───
  const toggleTask = useCallback(async (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const wasCompleted = task.completed;
    const nowCompleted = !wasCompleted;

    const result = await updateTask(taskId, { completed: nowCompleted });

    // Award XP when completing (not uncompleting)
    if (nowCompleted && result) {
      await awardXP(TASK_COMPLETE_XP);

      // Also log as a focus session (task = mini-session)
      try {
        await supabase.from("focus_sessions").insert({
          focus_id: focus?.id,
          user_id: userId,
          duration: task.time_estimate || 15,
          xp_earned: TASK_COMPLETE_XP,
          notes: `Task: ${task.title}`,
          session_date: todayStr,
        });

        // Refresh stats
        if (focus?.id) {
          const s = await fetchStats(focus.id);
          setStats(s);
        }
      } catch (err) {
        console.error("[useFocus] session log error:", err);
      }

      // Trigger XP toast
      setXpToast({ amount: TASK_COMPLETE_XP, taskTitle: task.title });
      setTimeout(() => setXpToast(null), 2500);
    }

    return result;
  }, [tasks, updateTask, awardXP, focus?.id, userId, todayStr, fetchStats]);

  // ─── Log session (manual) ───
  const logSession = useCallback(async (durationMinutes, xp = 0, notes = "") => {
    if (!focus?.id || !userId) return null;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("focus_sessions")
        .insert({
          focus_id: focus.id,
          user_id: userId,
          duration: durationMinutes,
          xp_earned: xp,
          notes,
          session_date: todayStr,
        })
        .select()
        .single();

      if (error) throw error;
      if (xp > 0) await awardXP(xp);

      const s = await fetchStats(focus.id);
      setStats(s);
      return data;
    } catch (err) {
      console.error("[useFocus] logSession error:", err);
      return null;
    } finally {
      setSaving(false);
    }
  }, [focus?.id, userId, todayStr, fetchStats, awardXP]);

  // ─── Computed values ───
  const daysSinceStart = useMemo(() => {
    if (!focus?.start_date) return 0;
    const start = new Date(focus.start_date + "T00:00:00");
    const now = new Date();
    return Math.max(1, Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1);
  }, [focus?.start_date]);

  const totalDays = useMemo(() => {
    if (!focus?.start_date) return 90;
    const start = new Date(focus.start_date + "T00:00:00");
    const end = focus.target_end_date
      ? new Date(focus.target_end_date + "T00:00:00")
      : new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
    return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  }, [focus?.start_date, focus?.target_end_date]);

  const ninetyDayProgress = useMemo(() => {
    return Math.min(100, Math.max(0, Math.round((daysSinceStart / totalDays) * 100)));
  }, [daysSinceStart, totalDays]);

  const weeklyHoursActual = useMemo(() => {
    return Math.round((stats.weekMinutes / 60) * 10) / 10;
  }, [stats.weekMinutes]);

  const weeklyTarget = useMemo(() => {
    return focus?.weekly_hours_target || 10;
  }, [focus?.weekly_hours_target]);

  const weeklyCompletion = useMemo(() => {
    if (!weeklyTarget) return 0;
    return Math.min(100, Math.round((weeklyHoursActual / weeklyTarget) * 100));
  }, [weeklyHoursActual, weeklyTarget]);

  const totalHours = useMemo(() => {
    return Math.round((stats.totalMinutes / 60) * 10) / 10;
  }, [stats.totalMinutes]);

  // ─── Momentum Tier ───
  const streak = useMemo(() => {
    // Use profile streak if available, fallback to days since start
    return daysSinceStart;
  }, [daysSinceStart]);

  const momentumTier = useMemo(() => {
    return getMomentumTier(streak, weeklyCompletion);
  }, [streak, weeklyCompletion]);

  // Simple direction: compare pace vs expected
  const momentumDirection = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay() || 7;
    const expectedHours = (weeklyTarget / 7) * dayOfWeek;
    if (expectedHours === 0) return "rising";
    return weeklyHoursActual >= expectedHours * 0.8 ? "rising" : "falling";
  }, [weeklyHoursActual, weeklyTarget]);

  // Today's tasks completion count
  const tasksCompletedToday = useMemo(() => {
    return tasks.filter((t) => t.completed).length;
  }, [tasks]);

  return {
    // Data
    focus,
    tasks,
    stats,
    loading,
    saving,
    error,
    xpToast,
    lastArchivedAt,

    // Cooldown
    cooldownRemaining,
    canCreateFocus,

    // Computed
    daysSinceStart,
    totalDays,
    ninetyDayProgress,
    weeklyHoursActual,
    weeklyTarget,
    weeklyCompletion,
    momentumTier,
    momentumDirection,
    totalHours,
    tasksCompletedToday,
    streak,

    // Constants
    TASK_COMPLETE_XP,

    // Actions
    createFocus,
    updateFocus,
    archiveFocus,
    addTask,
    updateTask,
    removeTask,
    toggleTask,
    logSession,
    refresh: loadAll,
  };
}
