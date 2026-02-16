import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../supabaseClient";
import { motion } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import { usePresence } from "../hooks/usePresence";
import { useLiveDashboard } from "../hooks/useLiveDashboard";
import "./Dashboard.css";

/* ── Helpers ── */
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

const MILESTONES = [7, 14, 30, 60, 90, 180, 365];

function getNextMilestone(streak) {
  for (const m of MILESTONES) if (streak < m) return m;
  return streak + 30;
}

function formatEventDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatEventTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* ── Animation ── */
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

/* ── Progression milestones ── */
const PROGRESSION_STEPS = [1, 7, 30, 100];

/* ── Time-based greeting ── */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/* ── Calculate days since start ── */
function getDaysSinceStart(streakStartDate) {
  if (!streakStartDate) return 1;
  const start = new Date(streakStartDate);
  const today = new Date();
  const diffTime = Math.abs(today - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays || 1;
}

export default function Dashboard() {
  const { user, profile, refreshProfile } = useAuth();

  const [checking, setChecking] = useState(false);
  const [weeklySessions, setWeeklySessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [featuredEvent, setFeaturedEvent] = useState(null);
  const [weekEvents, setWeekEvents] = useState([]);
  const [communities, setCommunities] = useState([]);

  /* ── Last 7 days check-in data for mini graph ── */
  const [weeklyData, setWeeklyData] = useState([0, 0, 0, 0, 0, 0, 0]);

  /* ── Real-time hooks ── */
  const { onlineCount } = usePresence(user?.id);
  const liveCounters = useLiveDashboard();

  /* ── Derived from profile ── */
  const streak = profile?.streak || 0;
  const focus = profile?.focus || "";
  const commitmentLevel = profile?.commitment_level || "";
  const lastCheckIn = profile?.last_check_in || null;
  const xp = profile?.xp || 0;
  const level = profile?.level || 0;
  const checkedInToday = lastCheckIn === getToday();
  const xpProgress = Math.min((xp % 100) / 100, 1);
  const streakStartDate = profile?.streak_start_date || null;
  const daysSinceStart = getDaysSinceStart(streakStartDate);

  /* ── Consistency % (last 7 days) ── */
  const consistencyPct = Math.min(
    Math.round((weeklySessions / 7) * 100),
    100
  );

  const committedHours = (() => {
    const cl = commitmentLevel?.toLowerCase() || "";
    if (cl.includes("fully")) return "4+";
    if (cl.includes("very")) return "3";
    if (cl.includes("moderately")) return "2";
    if (cl.includes("lightly")) return "1";
    return "—";
  })();

  /* ── Fetch dashboard data ── */
  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);

      // Parallel fetches
      const [checkinsRes, featuredRes, weekEventsRes, communitiesRes] =
        await Promise.all([
          supabase
            .from("checkins")
            .select("id")
            .eq("user_id", user.id)
            .gte("created_at", weekAgo.toISOString()),
          supabase
            .from("events")
            .select("*")
            .eq("is_featured", true)
            .gte("date", now.toISOString())
            .order("date", { ascending: true })
            .limit(1),
          supabase
            .from("events")
            .select("*")
            .gte("date", now.toISOString())
            .lte("date", weekEnd.toISOString())
            .order("date", { ascending: true })
            .limit(3),
          supabase
            .from("communities")
            .select("*")
            .order("rating", { ascending: false })
            .limit(6),
        ]);

      setWeeklySessions(checkinsRes.data?.length || 0);
      setFeaturedEvent(featuredRes.data?.[0] || null);
      setWeekEvents(weekEventsRes.data || []);
      setCommunities(communitiesRes.data || []);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  /* ── Fetch last 7 days hourly data ── */
  const fetchWeeklyGraph = useCallback(async () => {
    if (!user) return;
    try {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }

      const { data } = await supabase
        .from("checkins")
        .select("created_at, minutes_worked")
        .eq("user_id", user.id)
        .gte("created_at", days[0] + "T00:00:00");

      const mapped = days.map((day) => {
        const dayEntries = (data || []).filter(
          (c) => c.created_at?.slice(0, 10) === day
        );
        return dayEntries.reduce(
          (sum, c) => sum + (c.minutes_worked || 0),
          0
        ) / 60;
      });
      setWeeklyData(mapped);
    } catch (e) {
      /* silent */
    }
  }, [user]);

  useEffect(() => {
    fetchWeeklyGraph();
  }, [fetchWeeklyGraph]);

  /* ── Check-in handler ── */
  const handleCheckIn = async () => {
    if (checking || checkedInToday || !user) return;
    setChecking(true);
    try {
      const today = getToday();

      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("xp, level, streak, last_check_in, streak_start_date")
        .eq("id", user.id)
        .single();

      const prevLastCheckIn = currentProfile?.last_check_in;
      const prevStreak = currentProfile?.streak || 0;
      const prevXP = currentProfile?.xp || 0;

      let newStreak = 1;
      let newStreakStartDate = today;

      if (prevLastCheckIn) {
        const lastDate = new Date(prevLastCheckIn);
        const todayDate = new Date(today);
        const diffDays = Math.floor(
          (todayDate - lastDate) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 1) {
          newStreak = prevStreak + 1;
          newStreakStartDate = currentProfile?.streak_start_date || today;
        } else if (diffDays === 0) {
          setChecking(false);
          return;
        }
      }

      // XP cap: max 150 XP per day
      const todayStart = today + "T00:00:00.000Z";
      const { data: todayActivity } = await supabase
        .from("live_activity")
        .select("meta")
        .eq("user_id", user.id)
        .eq("type", "checkin")
        .gte("created_at", todayStart);

      const xpEarnedToday = (todayActivity || []).reduce(
        (sum, a) => sum + (a.meta?.xp_gained || 0), 0
      );
      const xpGain = Math.min(10, 150 - xpEarnedToday);
      const newXP = prevXP + Math.max(xpGain, 0);
      const prevLevel = currentProfile?.level || 0;
      const newLevel = Math.floor(Math.sqrt(newXP / 50));

      await supabase
        .from("profiles")
        .update({
          last_check_in: today,
          streak: newStreak,
          streak_start_date: newStreakStartDate,
          xp: newXP,
          level: newLevel,
        })
        .eq("id", user.id);

      // Insert checkin with date column for unique constraint
      const { error: checkinError } = await supabase.from("checkins").insert({
        user_id: user.id,
        goal_id: null,
        minutes_worked: 30,
        energy_level: 8,
        completed: true,
        date: today,
      });

      // If duplicate (unique constraint on user_id+date), silently skip
      if (checkinError && checkinError.code === "23505") {
        setChecking(false);
        return;
      }

      // Insert live_activity record for checkin
      await supabase.from("live_activity").insert({
        user_id: user.id,
        type: "checkin",
        meta: { streak: newStreak, xp_gained: Math.max(xpGain, 0) },
      });

      // If leveled up, insert a separate levelup activity
      if (newLevel > prevLevel) {
        await supabase.from("live_activity").insert({
          user_id: user.id,
          type: "levelup",
          meta: { from_level: prevLevel, to_level: newLevel, xp: newXP },
        });
      }

      await refreshProfile();
      setWeeklySessions((s) => s + 1);
      fetchWeeklyGraph();
    } catch (err) {
      console.error("Check-in failed:", err);
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout pageTitle="DASHBOARD">
        <div className="d-content">
          <div className="d-loading-inner">Loading…</div>
        </div>
      </DashboardLayout>
    );
  }

  /* ── Mini graph SVG path builder ── */
  const buildGraphPath = () => {
    const max = Math.max(...weeklyData, 1);
    const w = 280;
    const h = 60;
    const padY = 8;
    const points = weeklyData.map((v, i) => ({
      x: (i / 6) * w,
      y: h - padY - (v / max) * (h - padY * 2),
    }));

    if (points.length < 2) return { path: "", dots: points };

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cx = (points[i].x + points[i + 1].x) / 2;
      path += ` C ${cx} ${points[i].y}, ${cx} ${points[i + 1].y}, ${points[i + 1].x} ${points[i + 1].y}`;
    }
    return { path, dots: points };
  };

  const { path: graphPath, dots: graphDots } = buildGraphPath();

  /* ── Placeholder communities ── */
  const PLACEHOLDER_COMMUNITIES = [
    { id: "p1", name: "Discipline Lab", description: "Daily accountability for builders and learners.", rating: 4.8, members_count: 124 },
    { id: "p2", name: "Focus Circle", description: "Deep work sessions and productivity frameworks.", rating: 4.6, members_count: 89 },
    { id: "p3", name: "Growth Engine", description: "Track habits, share progress, level up together.", rating: 4.9, members_count: 203 },
  ];

  const displayCommunities = communities.length > 0
    ? communities.slice(0, 3)
    : PLACEHOLDER_COMMUNITIES;

  return (
    <DashboardLayout pageTitle="DASHBOARD">
      <motion.div
        className="d-content"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {/* ═══════ HERO SECTION ═══════ */}
        <motion.div className="d-hero" variants={fadeUp}>
          <div className="d-hero-main">
            <div className="d-hero-left">
              <h1 className="d-hero-greeting">{getGreeting()}</h1>
              <p className="d-hero-journey">
                Day {daysSinceStart} — Becoming <span className="d-hero-focus">{focus || "your best self"}</span>
              </p>
              <div className="d-hero-xp">
                <div className="d-hero-xp-track">
                  <motion.div
                    className="d-hero-xp-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${xpProgress * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
                <span className="d-hero-xp-text">Level {level} — {xp % 100}/100 XP</span>
              </div>
              <button
                className="d-btn d-btn-purple"
                onClick={handleCheckIn}
                disabled={checking || checkedInToday}
              >
                {checking ? "RECORDING…" : checkedInToday ? "✓ CHECKED IN TODAY" : "START TODAY"}
              </button>
            </div>
            <div className="d-hero-right">
              <div className="d-hero-streak">
                <div className="d-hero-flame">
                  <svg width="36" height="44" viewBox="0 0 36 44" fill="none">
                    <path
                      d="M18 0C18 0 28 10 28 20C28 26 24 32 18 34C12 32 8 26 8 20C8 10 18 0 18 0Z"
                      fill="url(#flameOuter)"
                    />
                    <path
                      d="M18 12C18 12 24 18 24 24C24 28 21 31 18 32C15 31 12 28 12 24C12 18 18 12 18 12Z"
                      fill="url(#flameInner)"
                    />
                    <defs>
                      <linearGradient id="flameOuter" x1="18" y1="0" x2="18" y2="34" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#FF8C00" />
                        <stop offset="1" stopColor="#FF4500" />
                      </linearGradient>
                      <linearGradient id="flameInner" x1="18" y1="12" x2="18" y2="32" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#FFD700" />
                        <stop offset="1" stopColor="#FF8C00" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="d-hero-streak-num">{streak}</div>
                <div className="d-hero-streak-label">DAY STREAK</div>
              </div>
              {lastCheckIn && (
                <div className="d-hero-last-checkin">
                  Last check-in: {lastCheckIn === getToday() ? "Today" : lastCheckIn}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ═══════ LIVE ACTIVITY STRIP ═══════ */}
        <motion.div className="d-live-strip" variants={fadeUp}>
          <span className="d-live-dot" />
          <span className="d-live-label">LIVE</span>
          <span className="d-live-divider" />
          <span className="d-live-stat">{onlineCount} online now</span>
          <span className="d-live-divider" />
          <span className="d-live-stat">{liveCounters.checkinsToday} checked in today</span>
          <span className="d-live-divider" />
          <span className="d-live-stat">{liveCounters.activeEvents} events active</span>
          <span className="d-live-divider" />
          <span className="d-live-stat">{liveCounters.levelUpsToday} level-ups today</span>
        </motion.div>

        {/* ═══════ STAT CARDS ═══════ */}
        <div className="d-row d-row-metrics">
          <motion.div className="d-card d-card-metric" variants={fadeUp}>
            <span className="d-card-label">WEEKLY SESSIONS</span>
            <motion.span
              className="d-metric-num"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {weeklySessions}
            </motion.span>
            <span className="d-card-sub">this week</span>
            <div className="d-metric-bar">
              <motion.div
                className="d-metric-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((weeklySessions / 7) * 100, 100)}%` }}
                transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              />
            </div>
          </motion.div>

          <motion.div className="d-card d-card-metric" variants={fadeUp}>
            <span className="d-card-label">COMMITMENT</span>
            <motion.span
              className="d-metric-num"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {committedHours}
            </motion.span>
            <span className="d-card-sub">hours / week</span>
            <div className="d-metric-bar">
              <div className="d-metric-bar-fill" style={{ width: "60%" }} />
            </div>
          </motion.div>

          <motion.div className="d-card d-card-metric" variants={fadeUp}>
            <span className="d-card-label">CURRENT LEVEL</span>
            <motion.span
              className="d-metric-num"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              {level}
            </motion.span>
            <span className="d-card-sub">{xp % 100}/100 XP</span>
            <div className="d-metric-bar">
              <motion.div
                className="d-metric-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress * 100}%` }}
                transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
              />
            </div>
          </motion.div>

          <motion.div className="d-card d-card-metric d-card-metric-consistency" variants={fadeUp}>
            <span className="d-card-label">CONSISTENCY</span>
            <div className="d-consistency-circle">
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r="30"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeWidth="3"
                />
                <motion.circle
                  cx="36"
                  cy="36"
                  r="30"
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 30}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 30 }}
                  animate={{
                    strokeDashoffset: 2 * Math.PI * 30 * (1 - consistencyPct / 100),
                  }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
                />
              </svg>
              <div className="d-consistency-text">{consistencyPct}%</div>
            </div>
            <span className="d-card-sub">last 7 days</span>
          </motion.div>
        </div>

        {/* ═══════ MINI PERFORMANCE GRAPH ═══════ */}
        <motion.div className="d-card d-graph-card" variants={fadeUp}>
          <span className="d-card-label">YOUR LAST 7 DAYS</span>
          <div className="d-graph-container">
            <svg width="100%" height="60" viewBox="0 0 280 60" preserveAspectRatio="none">
              {graphPath && (
                <motion.path
                  d={graphPath}
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
              )}
              {graphDots.map((dot, i) => (
                <motion.circle
                  key={i}
                  cx={dot.x}
                  cy={dot.y}
                  r="3"
                  fill="#8B5CF6"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.15 * i + 0.5 }}
                />
              ))}
            </svg>
            <div className="d-graph-labels">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className="d-graph-day">{d}</span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ═══════ BOTTOM ROW: RECOMMENDED + THIS WEEK ═══════ */}
        <div className="d-bottom-row">
          {/* ═══════ RECOMMENDED FOR YOU ═══════ */}
          <motion.div className="d-section d-section-compact" variants={fadeUp}>
            <h3 className="d-section-title">RECOMMENDED FOR YOU</h3>
            <div className="d-community-grid">
              {displayCommunities.map((c) => (
                <div key={c.id} className="d-card d-community-card">
                  <div className="d-community-info">
                    <h4 className="d-community-name">{c.name}</h4>
                    <p className="d-community-desc">{c.description}</p>
                    <div className="d-community-meta">
                      <span className="d-community-stat">★ {Number(c.rating).toFixed(1)}</span>
                      <span className="d-community-stat">{c.members_count} members</span>
                    </div>
                  </div>
                  <button className="d-btn d-btn-sm d-btn-outline-purple">JOIN</button>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ═══════ THIS WEEK ═══════ */}
          <motion.div className="d-section d-section-compact" variants={fadeUp}>
            <h3 className="d-section-title">THIS WEEK</h3>
            <div className="d-card d-events-compact">
              {weekEvents.length > 0 ? (
                weekEvents.slice(0, 2).map((ev) => (
                  <div key={ev.id} className="d-event-item">
                    <div className="d-event-item-left">
                      <h4 className="d-event-item-title">{ev.title}</h4>
                      <span className="d-event-item-date">
                        {formatEventDate(ev.date)} · {formatEventTime(ev.date)}
                      </span>
                      {ev.description && (
                        <p className="d-event-item-desc">{ev.description}</p>
                      )}
                    </div>
                    <button className="d-text-btn">Join</button>
                  </div>
                ))
              ) : (
                <p className="d-empty-text">No events this week.</p>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}