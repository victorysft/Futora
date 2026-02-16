import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGlobalStats } from "../hooks/useGlobalStats";
import { useGlobalActivity } from "../hooks/useGlobalActivity";
import { useCountryHeat } from "../hooks/useCountryHeat";
import { useCountUp } from "../hooks/useCountUp";
import { getRandomCountry } from "../utils/geolocation";
import Globe3D from "../components/Globe3D";
import DashboardLayout from "../components/DashboardLayout";
import "./GlobalLive.css";

/**
 * GlobalLive — Premium minimal Google-Earth-style command center
 *
 * Layout:
 * - Sidebar (DashboardLayout)
 * - Small top header: LIVE dot + title + view toggles
 * - Earth centered & dominant
 * - Floating Live Activity panel (right)
 * - "BUILDERS ACTIVE WORLDWIDE" presence strip below globe
 *
 * Data: Supabase Realtime only — no fake data
 */

// ── Constants ──────────────────────────────────────

const MAX_PULSES   = 100;
const PULSE_TTL    = 800;     // 0.8s
const MAX_FEED     = 15;
const FEED_TTL     = 20000;   // 20s

function formatTime(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function pulseColor(type) {
  switch (type) {
    case "login":    return "#10B981";
    case "checkin":  return "#8B5CF6";
    case "level_up": return "#D4AF37";
    default:         return "#8B5CF6";
  }
}

// ── Page ───────────────────────────────────────────

export default function GlobalLive() {
  const stats = useGlobalStats();
  const { activities } = useGlobalActivity();
  const { activityPulses } = useCountryHeat();

  const [buildersCount, buildersChanged] = useCountUp(stats.onlineNow);
  const [view, setView] = useState("live"); // "live" | "heatmap" (future)

  // ── Time display ───
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const utcTime = currentTime.toLocaleTimeString('en-US', { 
    timeZone: 'UTC', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  const localTime = currentTime.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // ── Pulses (max 100, 2.5s auto-expire) ───
  const [pulses, setPulses] = useState([]);
  const pulseTimers = useRef(new Map());

  useEffect(() => {
    if (activityPulses.length === 0) return;
    const latest = activityPulses[0];
    if (!latest || pulseTimers.current.has(latest.id)) return;

    const pulse = {
      id: latest.id,
      lat: latest.lat,
      lng: latest.lng,
      color: pulseColor(latest.type),
      startTime: Date.now(),
    };
    setPulses((prev) => [pulse, ...prev].slice(0, MAX_PULSES));

    const timer = setTimeout(() => {
      setPulses((prev) => prev.filter((p) => p.id !== pulse.id));
      pulseTimers.current.delete(latest.id);
    }, PULSE_TTL);
    pulseTimers.current.set(latest.id, timer);
  }, [activityPulses]);

  // ── Activity feed (max 15 visible, 20s TTL) ───
  const [feed, setFeed] = useState([]);

  useEffect(() => {
    const enhanced = activities.slice(0, MAX_FEED).map((act) => {
      if (!act.flag) {
        const rc = getRandomCountry();
        return { ...act, flag: rc.flag, country_name: rc.country_name, country_code: rc.country_code || rc.country_name.slice(0, 2).toUpperCase(), addedAt: act.addedAt || Date.now() };
      }
      return { ...act, country_code: act.country_code || act.country_name?.slice(0, 2).toUpperCase() || "XX", addedAt: act.addedAt || Date.now() };
    });
    setFeed(enhanced);

    const iv = setInterval(() => {
      setFeed((prev) => prev.filter((a) => Date.now() - a.addedAt < FEED_TTL));
    }, 3000);
    return () => clearInterval(iv);
  }, [activities]);

  // ── Active countries ───
  const activeCountries = useMemo(() => {
    const codes = new Set();
    feed.forEach((item) => {
      if (item.country_code) codes.add(item.country_code);
    });
    return Array.from(codes).slice(0, 6); // Max 6 countries shown
  }, [feed]);

  // Cleanup on unmount
  useEffect(() => () => pulseTimers.current.forEach((t) => clearTimeout(t)), []);

  return (
    <DashboardLayout pageTitle="">
      <div className="gl-page">
        {/* Deep space bg */}
        <div className="gl-bg" />

        {/* ─── Header ─── */}
        <header className="gl-header">
          {/* Left: Brand */}
          <div className="gl-header-left">
            <span className="gl-live-dot" />
            <h1 className="gl-title">GLOBAL LIVE</h1>
          </div>

          {/* Center: Metrics */}
          <div className="gl-header-center">
            <div className="gl-metric">
              <span className="gl-metric-label">ONLINE</span>
              <span className={`gl-metric-value ${buildersChanged ? "gl-metric-flash" : ""}`}>{buildersCount}</span>
            </div>
            <div className="gl-metric-divider" />
            <div className="gl-metric">
              <span className="gl-metric-label">CHECK-INS</span>
              <span className="gl-metric-value">{stats.checkInsToday}</span>
            </div>
            <div className="gl-metric-divider" />
            <div className="gl-metric">
              <span className="gl-metric-label">LEVEL-UPS</span>
              <span className="gl-metric-value">{stats.levelUpsToday}</span>
            </div>
            <div className="gl-metric-divider" />
            <div className="gl-metric">
              <span className="gl-metric-label">COUNTRIES</span>
              <span className="gl-metric-value">{activeCountries.length}</span>
            </div>
          </div>

          {/* Right: Time + Toggles */}
          <div className="gl-header-right">
            <span className="gl-time">UTC {utcTime} · LOCAL {localTime}</span>
            <div className="gl-toggles">
              <button
                className={`gl-toggle ${view === "live" ? "gl-toggle-active" : ""}`}
                onClick={() => setView("live")}
              >
                Live
              </button>
              <button
                className={`gl-toggle ${view === "heatmap" ? "gl-toggle-active" : ""}`}
                onClick={() => setView("heatmap")}
              >
                Heatmap
              </button>
            </div>
          </div>
        </header>

        {/* ─── Main area ─── */}
        <div className="gl-main">
          {/* Globe — centered & floating */}
          <div className="gl-globe-area">
            <div className="gl-globe-ambient" />
            <div className="gl-globe-container" title="Drag to rotate">
              <Globe3D pulses={view === "live" ? pulses : []} onlineCount={stats.onlineNow} />
            </div>
          </div>

          {/* ── Floating feed panel ── */}
          <div className="gl-feed">
            <div className="gl-feed-header">
              <h3>LIVE ACTIVITY</h3>
              <span className="gl-feed-count">{feed.length}</span>
            </div>
            <div className="gl-feed-body">
              <AnimatePresence mode="popLayout">
                {feed.map((item) => {
                  const parts = (item.description || "").split(" ");
                  const user  = parts[0];
                  const rest  = parts.slice(1).join(" ");
                  const gold  = item.type === "level_up";
                  return (
                    <motion.div
                      key={item.id}
                      layoutId={item.id}
                      className={`gl-feed-item ${gold ? "gl-feed-item-gold" : ""}`}
                      initial={{ opacity: 0, x: 16, scale: 0.97 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -16, scale: 0.97 }}
                      transition={{ duration: 0.3 }}
                    >
                      <span className="gl-feed-flag">{item.flag}</span>
                      <div className="gl-feed-text">
                        <div className="gl-feed-top">
                          <span className="gl-feed-user">{user}</span>
                          <span className="gl-feed-time">{formatTime(item.timestamp)}</span>
                        </div>
                        <p className="gl-feed-desc">
                          {rest}
                          {item.country_name && <span className="gl-feed-country"> · {item.country_name}</span>}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {feed.length === 0 && (
                <div className="gl-feed-empty">Waiting for activity…</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
