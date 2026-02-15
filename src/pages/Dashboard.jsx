import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../supabaseClient";
import { motion } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
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

/* ── Daily quotes ── */
const QUOTES = [
  "If not you, then who.",
  "Discipline is the bridge between goals and accomplishment.",
  "The future belongs to those who prepare for it.",
  "Small daily improvements over time lead to stunning results.",
  "Stay patient and trust your journey.",
  "What you do today matters more than what you plan to do tomorrow.",
  "Ambition is the first step. Action is every step after.",
];

function getDailyQuote() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
  );
  return QUOTES[dayOfYear % QUOTES.length];
}

export default function Dashboard() {
  const { user, profile, refreshProfile } = useAuth();

  const [checking, setChecking] = useState(false);
  const [weeklySessions, setWeeklySessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [featuredEvent, setFeaturedEvent] = useState(null);
  const [weekEvents, setWeekEvents] = useState([]);
  const [communities, setCommunities] = useState([]);

  /* ── Derived from profile ── */
  const streak = profile?.streak || 0;
  const focus = profile?.focus || "";
  const commitmentLevel = profile?.commitment_level || "";
  const lastCheckIn = profile?.last_check_in || null;
  const xp = profile?.xp || 0;
  const level = profile?.level || 0;
  const checkedInToday = lastCheckIn === getToday();
  const xpProgress = Math.min((xp % 100) / 100, 1);

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

      const newXP = prevXP + 10;
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

      await supabase.from("checkins").insert({
        user_id: user.id,
        goal_id: null,
        minutes_worked: 30,
        energy_level: 8,
        completed: true,
      });

      await refreshProfile();
      setWeeklySessions((s) => s + 1);
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

  return (
    <DashboardLayout pageTitle="DASHBOARD">
      <motion.div
        className="d-content"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {/* ── Daily quote ── */}
        <motion.p className="d-quote" variants={fadeUp}>
          "{getDailyQuote()}"
        </motion.p>

        {/* ═══════ SECTION 1 — TOP STRIP ═══════ */}
        <div className="d-row d-row-metrics">
          <motion.div className="d-card d-card-metric" variants={fadeUp}>
            <span className="d-card-label">STREAK</span>
            <span className="d-metric-num">{streak}</span>
            <span className="d-card-sub">days</span>
          </motion.div>

          <motion.div className="d-card d-card-metric" variants={fadeUp}>
            <span className="d-card-label">THIS WEEK</span>
            <span className="d-metric-num">{committedHours}</span>
            <span className="d-card-sub">hours committed</span>
          </motion.div>

          <motion.div className="d-card d-card-metric" variants={fadeUp}>
            <span className="d-card-label">LEVEL</span>
            <span className="d-metric-num">{level}</span>
            <div className="d-xp-bar">
              <div className="d-xp-track">
                <div
                  className="d-xp-fill"
                  style={{ width: `${xpProgress * 100}%` }}
                />
              </div>
              <span className="d-xp-text">XP: {xp % 100}/100</span>
            </div>
          </motion.div>

          <motion.div className="d-card d-card-metric" variants={fadeUp}>
            <span className="d-card-label">CONSISTENCY</span>
            <span className="d-metric-num">{consistencyPct}%</span>
            <span className="d-card-sub">last 7 days</span>
          </motion.div>
        </div>

        {/* ═══════ SECTION 2 — DON'T MISS ═══════ */}
        <motion.div className="d-section" variants={fadeUp}>
          <h3 className="d-section-title">DON'T MISS</h3>
          <div className="d-featured-card d-card">
            {featuredEvent ? (
              <>
                <div className="d-featured-header">
                  <span className="d-card-label">
                    THIS WEEK'S FEATURED EVENT
                  </span>
                  <span className="d-badge">
                    {new Date(featuredEvent.date) > new Date()
                      ? "UPCOMING"
                      : "LIVE"}
                  </span>
                </div>
                <h2 className="d-featured-title">{featuredEvent.title}</h2>
                <p className="d-featured-date">
                  {formatEventDate(featuredEvent.date)} ·{" "}
                  {formatEventTime(featuredEvent.date)}
                </p>
                <p className="d-featured-desc">{featuredEvent.description}</p>
                <button className="d-btn">JOIN</button>
              </>
            ) : (
              <>
                <span className="d-card-label">
                  THIS WEEK'S FEATURED EVENT
                </span>
                <h2 className="d-featured-title">No featured events</h2>
                <p className="d-featured-desc">
                  Check back soon — new events are added regularly.
                </p>
              </>
            )}
          </div>
        </motion.div>

        {/* ═══════ SECTION 3 — RECOMMENDED FOR YOU ═══════ */}
        <motion.div className="d-section" variants={fadeUp}>
          <h3 className="d-section-title">RECOMMENDED FOR YOU</h3>
          {communities.length > 0 ? (
            <div className="d-community-scroll">
              {communities.map((c) => (
                <div key={c.id} className="d-card d-community-card">
                  {c.category && (
                    <span className="d-community-tag">{c.category}</span>
                  )}
                  <h4 className="d-community-name">{c.name}</h4>
                  <p className="d-community-desc">{c.description}</p>
                  <div className="d-community-meta">
                    <span className="d-community-stat">
                      ⭐ {Number(c.rating).toFixed(1)}
                    </span>
                    <span className="d-community-stat">
                      {c.members_count} members
                    </span>
                  </div>
                  <button className="d-btn d-btn-sm">JOIN</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="d-card">
              <p className="d-empty-text">
                Communities are launching soon.
              </p>
            </div>
          )}
        </motion.div>

        {/* ═══════ SECTION 4 — THIS WEEK EVENTS ═══════ */}
        <motion.div className="d-section" variants={fadeUp}>
          <h3 className="d-section-title">THIS WEEK</h3>
          {weekEvents.length > 0 ? (
            <div className="d-row d-row-events">
              {weekEvents.map((ev) => (
                <div key={ev.id} className="d-card d-event-card">
                  <span className="d-card-label">EVENT</span>
                  <h4 className="d-event-title">{ev.title}</h4>
                  <p className="d-event-date">
                    {formatEventDate(ev.date)} · {formatEventTime(ev.date)}
                  </p>
                  <button className="d-btn d-btn-sm">JOIN</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="d-card">
              <p className="d-empty-text">No events this week.</p>
            </div>
          )}
        </motion.div>

        {/* ═══════ SECTION 5 — PROGRESSION ═══════ */}
        <motion.div className="d-section" variants={fadeUp}>
          <h3 className="d-section-title">YOUR PROGRESSION</h3>
          <div className="d-card d-card-wide">
            <div className="d-timeline">
              {PROGRESSION_STEPS.map((step, i) => {
                const reached = streak >= step;
                return (
                  <div key={step} className="d-timeline-step">
                    {i > 0 && (
                      <div
                        className={`d-timeline-line${
                          streak >= step ? " d-timeline-line-active" : ""
                        }`}
                      />
                    )}
                    <div
                      className={`d-timeline-dot${
                        reached ? " d-timeline-dot-active" : ""
                      }`}
                    />
                    <span className="d-timeline-label">Day {step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* ── Check-in strip ── */}
        <motion.div className="d-checkin-strip" variants={fadeUp}>
          <div className="d-checkin-info">
            <span className="d-card-label">TODAY'S CHECK-IN</span>
            <span className="d-checkin-focus">{focus || "—"}</span>
          </div>
          <button
            className="d-btn"
            onClick={handleCheckIn}
            disabled={checking || checkedInToday}
          >
            {checking
              ? "RECORDING…"
              : checkedInToday
              ? "✓ Checked in today"
              : "START TODAY"}
          </button>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}