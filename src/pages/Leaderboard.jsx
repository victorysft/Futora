import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useLiveDashboard } from "../hooks/useLiveDashboard";
import { useXPToday } from "../hooks/useXPToday";
import { useOnlineUsers } from "../hooks/useOnlineUsers";
import { useTrendingFocus } from "../hooks/useTrendingFocus";
import DashboardLayout from "../components/DashboardLayout";
import "./Dashboard.css";
import "./Leaderboard.css";

/* ── Animation variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

/* ── Tabs ── */
const TABS = ["Global", "This Week", "Friends", "Focus"];

/* ── Rank badge styling ── */
const getRankStyle = (rank) => {
  if (rank === 1) return { glow: "rgba(255, 215, 0, 0.15)", color: "#FFD700", height: "extra" };
  if (rank === 2) return { glow: "rgba(192, 192, 192, 0.12)", color: "#C0C0C0", height: "extra" };
  if (rank === 3) return { glow: "rgba(205, 127, 50, 0.12)", color: "#CD7F32", height: "extra" };
  return { glow: "transparent", color: "rgba(255, 255, 255, 0.5)", height: "normal" };
};

/* ── Animated Flame SVG Component ── */
function FlameIcon({ streak }) {
  const glowIntensity = streak >= 8 ? 0.4 : streak >= 4 ? 0.25 : 0.15;
  const shouldPulse = streak >= 8;

  return (
    <svg
      width="16"
      height="20"
      viewBox="0 0 16 20"
      fill="none"
      className={`lb-flame ${shouldPulse ? "lb-flame-pulse" : ""}`}
      style={{ filter: `drop-shadow(0 0 6px rgba(255, 140, 0, ${glowIntensity}))` }}
    >
      <path
        d="M8 0C8 0 12 4 12 8C12 10.5 10 13 8 14C6 13 4 10.5 4 8C4 4 8 0 8 0Z"
        fill="url(#flameGrad)"
      />
      <defs>
        <linearGradient id="flameGrad" x1="8" y1="0" x2="8" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8C00" />
          <stop offset="1" stopColor="#FF4500" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Leaderboard() {
  const { user, profile } = useAuth();
  const { leaders, myRank, loading } = useLeaderboard(user?.id);
  const liveCounters = useLiveDashboard();
  const xpTodayMap = useXPToday();
  const { onlineUsers } = useOnlineUsers();
  const trendingFocus = useTrendingFocus();
  const [activeTab, setActiveTab] = useState("Global");
  const [onlinePanelOpen, setOnlinePanelOpen] = useState(false);
  const [hoveredRank, setHoveredRank] = useState(null);
  const [xpFlashIds, setXpFlashIds] = useState(new Set());
  const prevXpMapRef = useRef(new Map());

  /* ── Total profiles count for tooltip ── */
  const totalProfiles = leaders.length; // Approximation; could query DB for exact count

  /* ── Track XP changes for flash animation ── */
  useEffect(() => {
    const prevMap = prevXpMapRef.current;
    const newFlashIds = new Set();

    xpTodayMap.forEach((xp, userId) => {
      if (prevMap.has(userId) && prevMap.get(userId) < xp) {
        newFlashIds.add(userId);
      }
    });

    if (newFlashIds.size > 0) {
      setXpFlashIds(newFlashIds);
      setTimeout(() => setXpFlashIds(new Set()), 300);
    }

    prevXpMapRef.current = new Map(xpTodayMap);
  }, [xpTodayMap]);

  /* ── Filter leaders by tab ── */
  const filteredLeaders = useMemo(() => {
    // TODO: Implement filtering logic for This Week, Friends, Focus
    // For now, just return all leaders (Global)
    return leaders;
  }, [leaders, activeTab]);

  if (loading) {
    return (
      <DashboardLayout pageTitle="LEADERBOARD">
        <div className="d-content">
          <div className="d-loading-inner">Loading rankings…</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="LEADERBOARD">
      <div className="d-content lb-content">
        {/* ═══════ HERO STRIP ═══════ */}
        <motion.div className="lb-hero" variants={fadeUp} initial="hidden" animate="visible">
          <div className="lb-hero-left">
            <h1 className="lb-hero-title">GLOBAL LEADERBOARD</h1>
            <p className="lb-hero-sub">Top builders worldwide</p>
          </div>
          <div className="lb-hero-stats">
            <button
              className="lb-stat-chip lb-stat-chip-clickable"
              onClick={() => setOnlinePanelOpen(true)}
            >
              <span className="lb-stat-label">ONLINE NOW</span>
              <span className="lb-stat-value">{liveCounters.onlineUsers}</span>
            </button>
            <div className="lb-stat-chip">
              <span className="lb-stat-label">CHECK-INS TODAY</span>
              <span className="lb-stat-value">{liveCounters.checkinsToday}</span>
            </div>
            <div className="lb-stat-chip">
              <span className="lb-stat-label">LEVEL-UPS TODAY</span>
              <span className="lb-stat-value">{liveCounters.levelUpsToday}</span>
            </div>
          </div>
        </motion.div>

        {/* ═══════ TRENDING FOCUS STRIP ═══════ */}
        <motion.div
          className="lb-trending"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <span className="lb-trending-label">TRENDING FOCUS THIS WEEK</span>
          <div className="lb-trending-tags">
            {trendingFocus.length > 0 ? (
              trendingFocus.map((f, i) => (
                <div
                  key={i}
                  className={`lb-trending-tag ${i === 0 ? "lb-trending-tag-top" : ""}`}
                >
                  <span className="lb-trending-tag-name">{f.name}</span>
                  <span className="lb-trending-tag-count">{f.count} active</span>
                </div>
              ))
            ) : (
              <div className="lb-trending-tag">
                <span className="lb-trending-tag-name">No active focus yet</span>
              </div>
            )}
          </div>
        </motion.div>

        <div className="lb-main-row">
          {/* ═══════ LEADERBOARD TABLE ═══════ */}
          <motion.div
            className="lb-table-container"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
          >
            {/* Tabs */}
            <div className="lb-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  className={`lb-tab ${activeTab === tab ? "lb-tab-active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                  disabled={tab !== "Global"}
                >
                  {tab}
                  {tab !== "Global" && <span className="lb-tab-soon">SOON</span>}
                </button>
              ))}
            </div>

            {/* Microline Header */}
            <div className="lb-microline">Compete. Build. Rise.</div>

            {/* Table */}
            <div className="d-card lb-table-card">
              <div className="lb-table-header">
                <div className="lb-col lb-col-rank">RANK</div>
                <div className="lb-col lb-col-user">BUILDER</div>
                <div className="lb-col lb-col-focus">FOCUS</div>
                <div className="lb-col lb-col-level">LEVEL</div>
                <div className="lb-col lb-col-xp">XP</div>
                <div className="lb-col lb-col-xp-today">+XP TODAY</div>
                <div className="lb-col lb-col-streak">STREAK</div>
              </div>

              <motion.div
                className="lb-table-body"
                variants={stagger}
                initial="hidden"
                animate="visible"
              >
                <AnimatePresence mode="popLayout">
                  {filteredLeaders.map((leader, index) => {
                    const rank = index + 1;
                    const isMe = leader.id === user?.id;
                    const rankStyle = getRankStyle(rank);
                    const xpToday = xpTodayMap.get(leader.id) || 0;
                    const hasXpFlash = xpFlashIds.has(leader.id);

                    return (
                      <motion.div
                        key={leader.id}
                        layoutId={leader.id}
                        className={`lb-row ${isMe ? "lb-row-me" : ""} ${
                          rankStyle.height === "extra" ? "lb-row-top3" : ""
                        }`}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{
                          layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
                        }}
                      >
                        <div
                          className="lb-col lb-col-rank"
                          onMouseEnter={() => setHoveredRank(rank)}
                          onMouseLeave={() => setHoveredRank(null)}
                        >
                          <span
                            className="lb-rank-badge"
                            style={{
                              color: rankStyle.color,
                              boxShadow: `0 0 16px ${rankStyle.glow}`,
                            }}
                          >
                            #{rank}
                          </span>
                          {hoveredRank === rank && (
                            <div className="lb-rank-tooltip">
                              Ranked #{rank} out of {totalProfiles} global builders.
                            </div>
                          )}
                        </div>
                        <div className="lb-col lb-col-user">
                          <div className="lb-user-info">
                            <span className="lb-user-name">
                              {leader.identity || leader.becoming || "Anonymous"}
                            </span>
                            {isMe && <span className="lb-user-badge">YOU</span>}
                          </div>
                        </div>
                        <div className="lb-col lb-col-focus">
                          {leader.becoming || "—"}
                        </div>
                        <div className="lb-col lb-col-level">{leader.level || 0}</div>
                        <div className="lb-col lb-col-xp">
                          {(leader.xp || 0).toLocaleString()}
                        </div>
                        <motion.div
                          className={`lb-col lb-col-xp-today ${hasXpFlash ? "lb-xp-flash" : ""}`}
                          key={`xp-${leader.id}-${xpToday}`}
                          initial={{ scale: 1 }}
                          animate={hasXpFlash ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                          transition={{ duration: 0.3 }}
                        >
                          <span className="lb-xp-today-value">
                            {xpToday > 0 ? `+${xpToday}` : "—"}
                          </span>
                        </motion.div>
                        <div className="lb-col lb-col-streak">
                          <div className="lb-streak-container">
                            <FlameIcon streak={leader.streak || 0} />
                            <span className="lb-streak-num">{leader.streak || 0}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>

              {filteredLeaders.length === 0 && (
                <div className="d-empty-text">No rankings yet. Be the first!</div>
              )}
            </div>
          </motion.div>

          {/* ═══════ YOUR RANK PANEL ═══════ */}
          <motion.div
            className="lb-rank-panel"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
          >
            <div className="d-card lb-rank-card">
              <span className="d-card-label">YOUR RANK</span>
              <div className="lb-rank-big">
                {myRank ? `#${myRank}` : "—"}
              </div>
              <div className="lb-rank-meta">
                <span className="lb-rank-xp">
                  {(profile?.xp || 0).toLocaleString()} XP
                </span>
                <span className="lb-rank-level">Level {profile?.level || 0}</span>
              </div>
              <div className="lb-rank-progress">
                <div className="lb-rank-progress-track">
                  <motion.div
                    className="lb-rank-progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${((profile?.xp || 0) % 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
                <span className="lb-rank-progress-text">
                  {100 - ((profile?.xp || 0) % 100)} XP to next level
                </span>
              </div>
              <p className="lb-rank-message">Keep pushing.</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ═══════ ONLINE USERS PANEL ═══════ */}
      <AnimatePresence>
        {onlinePanelOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="lb-panel-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOnlinePanelOpen(false)}
            />
            
            {/* Panel */}
            <motion.div
              className="lb-online-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="lb-panel-header">
                <h3>Online Now</h3>
                <button
                  className="lb-panel-close"
                  onClick={() => setOnlinePanelOpen(false)}
                  aria-label="Close panel"
                >
                  ×
                </button>
              </div>
              
              <div className="lb-panel-body">
                {onlineUsers.length === 0 ? (
                  <div className="lb-panel-empty">No builders online right now.</div>
                ) : (
                  onlineUsers.map((user) => (
                    <div key={user.userId} className="lb-online-user">
                      <div className="lb-online-user-main">
                        <span className="lb-online-user-name">{user.username}</span>
                        <span className="lb-online-user-level">Lv. {user.level}</span>
                      </div>
                      <div className="lb-online-user-focus">{user.focus}</div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
