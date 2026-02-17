import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";

/**
 * useProgress — Full Progress analytics hook
 *
 * Provides:
 *  - Momentum overview (streak, longest streak, total hours, total XP)
 *  - Weekly consistency (last 7 days session data)
 *  - 30-day discipline heatmap
 *  - Performance breakdown (avg session, most productive day, etc.)
 *  - XP growth curve (cumulative XP over time)
 *  - Trend analysis (improving / stable / declining)
 */
export function useProgress(userId) {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState({
    currentStreak: 0,
    longestStreak: 0,
    totalHours: 0,
    totalXP: 0,
  });
  const [weeklyData, setWeeklyData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [performance, setPerformance] = useState({
    totalSessions: 0,
    avgSessionMin: 0,
    mostProductiveDay: null,
    weeklyTargetHours: 10,
    avgAchievedPct: 0,
    missedDays30: 0,
    trend: "stable",
  });
  const [xpCurve, setXpCurve] = useState([]);
  const [xpInsight, setXpInsight] = useState("");

  // ── Helpers ──
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const getDayLabel = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short" });
  };

  const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // ── Main fetch ──
  const fetchAll = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);

    try {
      // Date ranges
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(now.getDate() - 14);

      // Parallel fetches
      const [profileRes, checkinsRes, sessionsRes, activityRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("xp, level, streak, streak_start_date, commitment_level")
          .eq("id", userId)
          .single(),
        supabase
          .from("checkins")
          .select("id, date, minutes_worked, completed, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("focus_sessions")
          .select("duration, xp_earned, session_date, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("live_activity")
          .select("type, meta, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
      ]);

      const profile = profileRes.data;
      const checkins = checkinsRes.data || [];
      const sessions = sessionsRes.data || [];
      const activities = activityRes.data || [];

      // ═══════ OVERVIEW ═══════
      const currentStreak = profile?.streak || 0;

      // Longest streak from checkins
      let longestStreak = 0;
      let runStreak = 0;
      let prevDate = null;
      const checkinDates = [...new Set(
        checkins
          .filter(c => c.completed)
          .map(c => c.date || c.created_at?.slice(0, 10))
          .filter(Boolean)
      )].sort();

      for (const dateStr of checkinDates) {
        if (!prevDate) {
          runStreak = 1;
        } else {
          const prev = new Date(prevDate + "T00:00:00");
          const curr = new Date(dateStr + "T00:00:00");
          const diff = Math.round((curr - prev) / 86400000);
          runStreak = diff === 1 ? runStreak + 1 : 1;
        }
        if (runStreak > longestStreak) longestStreak = runStreak;
        prevDate = dateStr;
      }
      longestStreak = Math.max(longestStreak, currentStreak);

      // Total hours from checkins + sessions
      const checkinMinutes = checkins.reduce((s, c) => s + (c.minutes_worked || 0), 0);
      const sessionMinutes = sessions.reduce((s, c) => s + (c.duration || 0), 0);
      const totalMinutes = checkinMinutes + sessionMinutes;
      const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

      const totalXP = profile?.xp || 0;

      setOverview({ currentStreak, longestStreak, totalHours, totalXP });

      // ═══════ WEEKLY DATA (last 7 days) ═══════
      const weekDays = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        weekDays.push(d.toISOString().slice(0, 10));
      }

      const weeklyArr = weekDays.map(day => {
        const dayCheckins = checkins.filter(c =>
          (c.date || c.created_at?.slice(0, 10)) === day
        );
        const daySessions = sessions.filter(s =>
          (s.session_date || s.created_at?.slice(0, 10)) === day
        );
        const mins = dayCheckins.reduce((s, c) => s + (c.minutes_worked || 0), 0)
          + daySessions.reduce((s, c) => s + (c.duration || 0), 0);
        const sessionCount = dayCheckins.length + daySessions.length;
        return {
          date: day,
          label: getDayLabel(day),
          hours: Math.round((mins / 60) * 100) / 100,
          sessions: sessionCount,
        };
      });
      setWeeklyData(weeklyArr);

      // Weekly completion %
      const weekTarget = parseFloat(profile?.commitment_level?.match(/\d+/)?.[0]) || 10;
      const weekHoursActual = weeklyArr.reduce((s, d) => s + d.hours, 0);
      const weekCompletionPct = Math.min(Math.round((weekHoursActual / weekTarget) * 100), 100);

      // ═══════ 30-DAY HEATMAP ═══════
      const heatDays = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        heatDays.push(d.toISOString().slice(0, 10));
      }

      const heatArr = heatDays.map(day => {
        const dayCheckins = checkins.filter(c =>
          (c.date || c.created_at?.slice(0, 10)) === day
        );
        const daySessions = sessions.filter(s =>
          (s.session_date || s.created_at?.slice(0, 10)) === day
        );
        const mins = dayCheckins.reduce((s, c) => s + (c.minutes_worked || 0), 0)
          + daySessions.reduce((s, c) => s + (c.duration || 0), 0);
        const sessionCount = dayCheckins.length + daySessions.length;
        const xp = daySessions.reduce((s, c) => s + (c.xp_earned || 0), 0);
        return {
          date: day,
          minutes: mins,
          sessions: sessionCount,
          xp,
          level: mins === 0 ? 0 : mins < 30 ? 1 : mins < 60 ? 2 : mins < 120 ? 3 : 4,
        };
      });
      setHeatmapData(heatArr);

      // ═══════ PERFORMANCE BREAKDOWN ═══════
      const allSessions = [
        ...checkins.filter(c => c.completed).map(c => ({
          minutes: c.minutes_worked || 0,
          date: c.date || c.created_at?.slice(0, 10),
          dayOfWeek: new Date((c.date || c.created_at?.slice(0, 10)) + "T00:00:00").getDay(),
        })),
        ...sessions.map(s => ({
          minutes: s.duration || 0,
          date: s.session_date || s.created_at?.slice(0, 10),
          dayOfWeek: new Date((s.session_date || s.created_at?.slice(0, 10)) + "T00:00:00").getDay(),
        })),
      ];

      const totalSessionCount = allSessions.length;
      const avgSessionMin = totalSessionCount > 0
        ? Math.round(allSessions.reduce((s, c) => s + c.minutes, 0) / totalSessionCount)
        : 0;

      // Most productive day of week
      const dayTotals = [0, 0, 0, 0, 0, 0, 0];
      allSessions.forEach(s => { dayTotals[s.dayOfWeek] += s.minutes; });
      const maxDayIdx = dayTotals.indexOf(Math.max(...dayTotals));
      const mostProductiveDay = totalSessionCount > 0 ? DAYS_FULL[maxDayIdx] : null;

      // Missed days in last 30
      const activeDaysSet = new Set(heatArr.filter(d => d.minutes > 0).map(d => d.date));
      const missedDays30 = 30 - activeDaysSet.size;

      // Trend: compare last 7 vs previous 7 days
      const last7Mins = heatArr.slice(-7).reduce((s, d) => s + d.minutes, 0);
      const prev7Mins = heatArr.slice(0, 7).reduce((s, d) => s + d.minutes, 0);
      // If heatmap has more than 14 days, take days 16-23 as prev, else use first 7
      let trend = "stable";
      if (prev7Mins > 0) {
        const ratio = last7Mins / prev7Mins;
        if (ratio > 1.15) trend = "improving";
        else if (ratio < 0.85) trend = "declining";
      } else if (last7Mins > 0) {
        trend = "improving";
      }

      // Avg weekly achievement (simplified from last 4 weeks)
      const weeks = [];
      for (let w = 0; w < 4; w++) {
        const wStart = 29 - (w + 1) * 7 + 1;
        const wEnd = 29 - w * 7 + 1;
        const slice = heatArr.slice(Math.max(0, wStart), wEnd);
        const wMins = slice.reduce((s, d) => s + d.minutes, 0);
        weeks.push(wMins / 60);
      }
      const avgWeeklyHours = weeks.reduce((s, h) => s + h, 0) / weeks.length;
      const avgAchievedPct = Math.min(Math.round((avgWeeklyHours / weekTarget) * 100), 100);

      setPerformance({
        totalSessions: totalSessionCount,
        avgSessionMin,
        mostProductiveDay,
        weeklyTargetHours: weekTarget,
        avgAchievedPct,
        missedDays30,
        trend,
      });

      // ═══════ XP GROWTH CURVE ═══════
      // Build cumulative XP from activities
      const xpByDate = {};
      activities.forEach(a => {
        const date = a.created_at?.slice(0, 10);
        if (!date) return;
        const meta = typeof a.meta === "string" ? JSON.parse(a.meta) : (a.meta || {});
        const xpVal = meta.xp_gained || meta.xp || 0;
        xpByDate[date] = (xpByDate[date] || 0) + xpVal;
      });

      // Fill gaps for last 30 days
      let cumulative = 0;
      const xpCurveArr = [];

      // Calculate starting XP (total XP minus what was earned in last 30 days)
      const totalEarnedIn30 = heatDays.reduce((s, d) => s + (xpByDate[d] || 0), 0);
      cumulative = Math.max(0, totalXP - totalEarnedIn30);

      for (const day of heatDays) {
        cumulative += xpByDate[day] || 0;
        xpCurveArr.push({ date: day, xp: cumulative });
      }
      setXpCurve(xpCurveArr);

      // XP insight
      const last7XP = heatDays.slice(-7).reduce((s, d) => s + (xpByDate[d] || 0), 0);
      const prev7XP = heatDays.slice(16, 23).reduce((s, d) => s + (xpByDate[d] || 0), 0);
      if (prev7XP > 0 && last7XP > prev7XP) {
        const pct = Math.round(((last7XP - prev7XP) / prev7XP) * 100);
        setXpInsight(`You are gaining XP ${pct}% faster than last week.`);
      } else if (prev7XP > 0 && last7XP < prev7XP) {
        const pct = Math.round(((prev7XP - last7XP) / prev7XP) * 100);
        setXpInsight(`XP gain is ${pct}% slower than last week. Stay consistent.`);
      } else if (last7XP > 0) {
        setXpInsight(`You earned ${last7XP} XP this week. Keep building.`);
      } else {
        setXpInsight("");
      }
    } catch (err) {
      console.error("[useProgress] error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, todayStr]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Weekly completion
  const weeklyCompletionPct = useMemo(() => {
    const totalHrs = weeklyData.reduce((s, d) => s + d.hours, 0);
    const target = performance.weeklyTargetHours || 10;
    return Math.min(Math.round((totalHrs / target) * 100), 100);
  }, [weeklyData, performance.weeklyTargetHours]);

  return {
    loading,
    overview,
    weeklyData,
    weeklyCompletionPct,
    heatmapData,
    performance,
    xpCurve,
    xpInsight,
  };
}
