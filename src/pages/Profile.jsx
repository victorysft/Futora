import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useProfilePage, getLevelTitle } from "../hooks/useProfilePage";
import { useFollowing } from "../hooks/useFollowing";
import "./Profile.css";

/* ========================================================
   FUTORA  Profile 4.0  X-style Identity Center
   ======================================================== */

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

/* -- Tabs -- */
const TABS = ["Posts", "Focus Logs", "Achievements", "Stats"];

/* -- Post type config -- */
const POST_TYPE_MAP = {
  progress: { label: "Progress", color: "#10B981", icon: "📈" },
  reflection: { label: "Reflection", color: "#8B5CF6", icon: "💭" },
  mission: { label: "Mission", color: "#3B82F6", icon: "🎯" },
};

/* -- Formatters -- */
function timeAgo(dateStr) {
  var s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 604800) return Math.floor(s / 86400) + "d ago";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDuration(minutes) {
  if (minutes < 60) return minutes + "m";
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  return m > 0 ? h + "h " + m + "m" : h + "h";
}

/* ========================================================
   USER AVATAR (image or letter fallback)
   ======================================================== */
function UserAvatar({ identity, avatarUrl, size, onClick, showRing }) {
  size = size || 64;
  var letter = (identity || "?")[0].toUpperCase();

  if (avatarUrl) {
    return (
      <div
        className={"prf-avatar" + (showRing ? " prf-avatar-with-ring" : "")}
        style={{ width: size, height: size, cursor: onClick ? "pointer" : "default" }}
        onClick={onClick}
      >
        <img src={avatarUrl} alt={identity} className="prf-avatar-img" style={{ width: size, height: size }} />
        {showRing && <div className="prf-avatar-ring" />}
      </div>
    );
  }

  return (
    <div
      className={"prf-avatar" + (showRing ? " prf-avatar-with-ring" : "")}
      style={{ width: size, height: size, cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <span className="prf-avatar-letter" style={{ fontSize: size * 0.4 }}>{letter}</span>
      {showRing && <div className="prf-avatar-ring" />}
    </div>
  );
}

/* ========================================================
   VERIFIED BADGE
   ======================================================== */
function VerifiedBadge({ badgeType }) {
  var title =
    badgeType === "centurion" ? "100+ Focus Hours"
    : badgeType === "iron_streak" ? "30-Day Streak"
    : "Verified";

  return (
    <span className="prf-verified-badge" title={title}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 0L9.8 2.4L12.8 2L12.4 5L15 6.8L13.2 9.2L14 12L11.2 12.4L9.8 15L8 13L6.2 15L4.8 12.4L2 12L2.8 9.2L1 6.8L3.6 5L3.2 2L6.2 2.4L8 0Z" fill="#3B82F6" />
        <path d="M6.5 8.5L7.5 9.5L10 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ========================================================
   XP BAR (Animated)
   ======================================================== */
function XPBar({ pct, xpInLevel, xpNeeded }) {
  return (
    <div className="prf-xp-bar-wrap">
      <div className="prf-xp-bar">
        <motion.div className="prf-xp-fill" initial={{ width: 0 }} animate={{ width: pct + "%" }} transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }} />
      </div>
      <span className="prf-xp-text">{xpInLevel} / {xpNeeded} XP</span>
    </div>
  );
}

/* ========================================================
   FOLLOW BUTTON
   ======================================================== */
function FollowButton({ status, onFollow, onUnfollow }) {
  var [hover, setHover] = useState(false);

  if (status === "self") return null;

  if (status === "accepted" || status === "mutual") {
    return (
      <button
        className={"prf-follow-btn following" + (hover ? " unfollow-hover" : "")}
        onMouseEnter={function () { setHover(true); }}
        onMouseLeave={function () { setHover(false); }}
        onClick={onUnfollow}
      >
        {hover ? "Unfollow" : status === "mutual" ? "🤝 Friends" : "Following"}
      </button>
    );
  }

  if (status === "pending") {
    return (
      <button className="prf-follow-btn pending" onClick={onUnfollow}>
        Requested
      </button>
    );
  }

  return (
    <button className="prf-follow-btn" onClick={onFollow}>
      Follow
    </button>
  );
}

/* ========================================================
   DISCIPLINE TAG
   ======================================================== */
function DisciplineTag({ discipline }) {
  if (!discipline) return null;
  var colors = {
    coding: "#3B82F6",
    fitness: "#EF4444",
    study: "#F59E0B",
    writing: "#8B5CF6",
    meditation: "#06B6D4",
    reading: "#10B981",
    language: "#EC4899",
    music: "#A855F7",
    art: "#F97316",
    business: "#6366F1",
  };
  var color = colors[discipline.toLowerCase()] || "#8B5CF6";

  return (
    <span className="prf-discipline-tag" style={{ borderColor: color + "40", color: color }}>
      {discipline}
    </span>
  );
}

/* ========================================================
   HERO SECTION
   ======================================================== */
function HeroSection({ data, isOwn, followStatus, onFollow, onUnfollow, onEditProfile }) {
  if (!data) return null;

  return (
    <motion.div className="prf-hero" variants={fadeUp}>
      <div className="prf-hero-banner" />

      <div className="prf-hero-top">
        <UserAvatar identity={data.identity} avatarUrl={data.avatarUrl} size={88} showRing />

        <div className="prf-hero-actions">
          {isOwn ? (
            <button className="prf-edit-btn" onClick={onEditProfile}>Edit Profile</button>
          ) : (
            <FollowButton status={followStatus} onFollow={onFollow} onUnfollow={onUnfollow} />
          )}
        </div>
      </div>

      <div className="prf-identity">
        <div className="prf-name-row">
          <h1 className="prf-name">{data.identity}</h1>
          {data.isVerified && <VerifiedBadge badgeType={data.badgeType} />}
          <DisciplineTag discipline={data.discipline} />
        </div>
        {data.becoming && (
          <p className="prf-becoming">Becoming <span>{data.becoming}</span></p>
        )}
        {data.bio && <p className="prf-bio">{data.bio}</p>}
        {(data.missionStatement || data.focus) && (
          <p className="prf-mission-text">🎯 {data.missionStatement || data.focus}</p>
        )}
        <div className="prf-meta-row">
          {data.location && <span className="prf-meta-item">📍 {data.location}</span>}
          {data.memberSince && <span className="prf-meta-item">📅 Joined {data.memberSince}</span>}
          {data.commitmentLevel && <span className="prf-meta-item">⚡ {data.commitmentLevel}</span>}
        </div>
      </div>

      {/* Level + XP */}
      <div className="prf-level-block">
        <div className="prf-level-header">
          <span className="prf-level-badge">Lv. {data.level}</span>
          <span className="prf-level-title">{data.levelTitle}</span>
          <span className="prf-xp-total">{data.xp.toLocaleString()} XP</span>
        </div>
        <XPBar pct={data.xpPct} xpInLevel={data.xpInLevel} xpNeeded={data.xpNeeded} />
      </div>

      {/* Stats Strip */}
      <div className="prf-stats-strip">
        <StatItem value={data.streak} label="Streak" icon="🔥" />
        <div className="prf-stat-divider" />
        <StatItem value={data.focusScore} label="Focus Score" />
        <div className="prf-stat-divider" />
        <StatItem value={"#" + (data.rank || "—")} label="Rank" />
        <div className="prf-stat-divider" />
        <StatItem value={data.totalFocusHours + "h"} label="Total Hours" />
        <div className="prf-stat-divider" />
        <StatItem value={data.followersCount} label="Followers" clickable />
        <div className="prf-stat-divider" />
        <StatItem value={data.followingCount} label="Following" clickable />
      </div>
    </motion.div>
  );
}

function StatItem({ value, label, icon, clickable }) {
  return (
    <div className={"prf-stat" + (clickable ? " prf-stat-clickable" : "")}>
      <span className="prf-stat-value">{icon ? icon + " " : ""}{value}</span>
      <span className="prf-stat-label">{label}</span>
    </div>
  );
}

/* ========================================================
   COMPOSE POST
   ======================================================== */
function ComposePost({ onPost, loading }) {
  var [content, setContent] = useState("");
  var [type, setType] = useState("reflection");

  var handleSubmit = async function () {
    if (!content.trim() || loading) return;
    var result = await onPost(type, content);
    if (result) { setContent(""); setType("reflection"); }
  };

  var handleKeyDown = function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  return (
    <div className="prf-compose">
      <div className="prf-compose-types">
        {Object.entries(POST_TYPE_MAP).map(function ([key, cfg]) {
          return (
            <button key={key} className={"prf-type-btn" + (type === key ? " active" : "")} onClick={function () { setType(key); }} style={{ "--type-color": cfg.color }}>
              {cfg.icon} {cfg.label}
            </button>
          );
        })}
      </div>
      <textarea
        className="prf-compose-input"
        placeholder={type === "progress" ? "Share a milestone or progress update..." : type === "mission" ? "Update your mission or direction..." : "Share a reflection or insight..."}
        value={content} onChange={function (e) { setContent(e.target.value); }} onKeyDown={handleKeyDown} rows={3} maxLength={500}
      />
      <div className="prf-compose-footer">
        <span className="prf-char-count">{content.length}/500</span>
        <button className="prf-post-btn" onClick={handleSubmit} disabled={!content.trim() || loading}>
          {loading ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}

/* ========================================================
   POST CARD
   ======================================================== */
function PostCard({ post, liked, reposted, onLike, onRepost, onDelete, isOwn }) {
  var cfg = POST_TYPE_MAP[post.type] || POST_TYPE_MAP.reflection;

  return (
    <motion.div className="prf-post" variants={fadeUp}>
      <div className="prf-post-header">
        <span className="prf-post-type" style={{ color: cfg.color, borderColor: cfg.color + "33" }}>
          {cfg.icon} {cfg.label}
        </span>
        <span className="prf-post-time">{timeAgo(post.created_at)}</span>
      </div>
      <p className="prf-post-content">{post.content}</p>
      <div className="prf-post-actions">
        <button className={"prf-action-btn" + (liked ? " active" : "")} onClick={function () { onLike(post.id); }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 12.5C7 12.5 1 9 1 5C1 3 2.5 1.5 4.5 1.5C5.8 1.5 6.8 2.2 7 3C7.2 2.2 8.2 1.5 9.5 1.5C11.5 1.5 13 3 13 5C13 9 7 12.5 7 12.5Z" fill={liked ? "#EF4444" : "none"} stroke={liked ? "#EF4444" : "currentColor"} strokeWidth="1.2" />
          </svg>
          {post.likes_count > 0 && <span>{post.likes_count}</span>}
        </button>
        <button className="prf-action-btn">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1.5 9.5V12L4 10C4.5 10.2 5.2 10.5 6 10.5H8C10.5 10.5 12.5 8.5 12.5 6C12.5 3.5 10.5 1.5 8 1.5H6C3.5 1.5 1.5 3.5 1.5 6V9.5Z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          {post.replies_count > 0 && <span>{post.replies_count}</span>}
        </button>
        <button className={"prf-action-btn" + (reposted ? " active repost" : "")} onClick={function () { onRepost(post.id); }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M10 1.5L12.5 4L10 6.5M4 7.5L1.5 10L4 12.5M3 10H11C11.8 10 12.5 9.3 12.5 8.5V4M11 4H3C2.2 4 1.5 4.7 1.5 5.5V10" stroke={reposted ? "#10B981" : "currentColor"} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {post.reposts_count > 0 && <span>{post.reposts_count}</span>}
        </button>
        {isOwn && (
          <button className="prf-action-btn delete" onClick={function () { onDelete(post.id); }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4H12M5 4V2.5C5 2.2 5.2 2 5.5 2H8.5C8.8 2 9 2.2 9 2.5V4M3.5 4V11.5C3.5 11.8 3.7 12 4 12H10C10.3 12 10.5 11.8 10.5 11.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ========================================================
   FOCUS LOG CARD
   ======================================================== */
function FocusLogCard({ log }) {
  return (
    <motion.div className="prf-focus-log" variants={fadeUp}>
      <div className="prf-log-icon">⚡</div>
      <div className="prf-log-body">
        <span className="prf-log-name">{log.focusName}</span>
        <span className="prf-log-meta">{fmtDuration(log.duration)} · +{log.xpEarned} XP</span>
      </div>
      <span className="prf-log-date">{fmtDate(log.date)}</span>
    </motion.div>
  );
}

/* ========================================================
   ACHIEVEMENT CARD
   ======================================================== */
function AchievementCard({ achievement }) {
  return (
    <motion.div className={"prf-achievement" + (achievement.earned ? "" : " locked")} variants={fadeUp}>
      <span className="prf-ach-icon">{achievement.icon}</span>
      <span className="prf-ach-label">{achievement.label}</span>
      {!achievement.earned && <span className="prf-ach-lock">🔒</span>}
    </motion.div>
  );
}

/* ========================================================
   STATS TAB -- Heatmap + XP Curve
   ======================================================== */
function StatsTab({ stats }) {
  if (!stats) return null;
  var heatmap = stats.heatmap;
  var xpCurve = stats.xpCurve;

  var maxMin = Math.max.apply(null, heatmap.map(function (d) { return d.minutes; }).concat([1]));
  var getIntensity = function (minutes) {
    if (minutes === 0) return 0;
    if (minutes <= maxMin * 0.25) return 1;
    if (minutes <= maxMin * 0.5) return 2;
    if (minutes <= maxMin * 0.75) return 3;
    return 4;
  };

  var W = 560, H = 100, PAD = 16;

  var xpPath = useMemo(function () {
    if (!xpCurve.length) return { line: "", area: "" };
    var maxXP = Math.max.apply(null, xpCurve.map(function (d) { return d.xp; }).concat([1]));
    var step = (W - PAD * 2) / Math.max(xpCurve.length - 1, 1);
    var pts = xpCurve.map(function (d, i) {
      return { x: PAD + i * step, y: H - PAD - (d.xp / maxXP) * (H - PAD * 2) };
    });
    if (pts.length < 2) return { line: "", area: "" };
    var line = "M " + pts[0].x + " " + pts[0].y;
    for (var i = 0; i < pts.length - 1; i++) {
      var cx = (pts[i].x + pts[i + 1].x) / 2;
      line += " C " + cx + " " + pts[i].y + ", " + cx + " " + pts[i + 1].y + ", " + pts[i + 1].x + " " + pts[i + 1].y;
    }
    var area = line + " L " + pts[pts.length - 1].x + " " + (H - PAD) + " L " + pts[0].x + " " + (H - PAD) + " Z";
    return { line: line, area: area };
  }, [xpCurve]);

  return (
    <motion.div className="prf-stats-tab" variants={stagger} initial="hidden" animate="visible">
      <motion.div className="prf-card prf-heatmap-card" variants={fadeUp}>
        <h3 className="prf-card-title">30-Day Activity</h3>
        <div className="prf-heatmap-grid">
          {heatmap.map(function (day) {
            return <div key={day.date} className={"prf-heat-cell intensity-" + getIntensity(day.minutes)} title={fmtDate(day.date) + ": " + day.minutes + "m"} />;
          })}
        </div>
        <div className="prf-heatmap-legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map(function (i) {
            return <div key={i} className={"prf-heat-cell legend intensity-" + i} />;
          })}
          <span>More</span>
        </div>
      </motion.div>

      {xpCurve.length > 1 && (
        <motion.div className="prf-card prf-xp-curve-card" variants={fadeUp}>
          <h3 className="prf-card-title">XP Growth</h3>
          <div className="prf-xp-graph">
            <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" className="prf-graph-svg">
              <defs>
                <linearGradient id="prfXpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
                </linearGradient>
              </defs>
              {xpPath.area && <path d={xpPath.area} fill="url(#prfXpGrad)" />}
              {xpPath.line && <path d={xpPath.line} fill="none" stroke="#8B5CF6" strokeWidth="2" />}
            </svg>
          </div>
          <div className="prf-xp-curve-footer">
            <span>{(xpCurve[0] && xpCurve[0].xp) || 0} XP</span>
            <span>{(xpCurve[xpCurve.length - 1] && xpCurve[xpCurve.length - 1].xp) || 0} XP</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ========================================================
   EMPTY STATE
   ======================================================== */
function EmptyState({ tab, isOwn }) {
  var msgs = {
    Posts: isOwn ? "No posts yet. Share your first reflection or progress update." : "This user hasn't posted yet.",
    "Focus Logs": isOwn ? "No focus sessions recorded yet. Start a focus session to see your logs here." : "No focus sessions to show.",
    Achievements: isOwn ? "Keep building your streak and earning XP to unlock achievements." : "No achievements unlocked yet.",
    Stats: isOwn ? "Not enough data yet. Check in daily to build your activity history." : "Not enough data to display.",
  };
  return (
    <div className="prf-empty">
      <p>{msgs[tab] || "Nothing here yet."}</p>
    </div>
  );
}

/* ========================================================
   ANTI-SCROLL
   ======================================================== */
function AntiScrollOverlay({ onDismiss }) {
  return (
    <motion.div className="prf-anti-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="prf-anti-scroll-inner">
        <div className="prf-anti-scroll-icon">⏸️</div>
        <h3>Time to Refocus</h3>
        <p>You have been scrolling for a while. Take a moment to reflect.</p>
        <div className="prf-anti-scroll-actions">
          <button className="prf-anti-btn primary" onClick={onDismiss}>Back to Profile</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ========================================================
   MAIN PROFILE COMPONENT
   ======================================================== */
export default function Profile() {
  var { user } = useAuth();
  var params = useParams();
  var navigate = useNavigate();

  /* Determine whose profile we are viewing */
  var viewingUserId = params.userId || (user && user.id);
  var isOwn = !params.userId || params.userId === (user && user.id);

  var {
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
    refresh,
  } = useProfilePage(viewingUserId);

  /* Follow state for other users */
  var {
    getFollowState,
    follow,
    unfollow,
    fetchFollowStates: loadFollowStates,
  } = useFollowing(user && user.id);

  var followState = useMemo(function () {
    if (isOwn || !viewingUserId) return { status: "self", loading: false };
    return getFollowState(viewingUserId);
  }, [isOwn, viewingUserId, getFollowState]);

  /* Fetch follow state for this user */
  useEffect(function () {
    if (!isOwn && viewingUserId && loadFollowStates) {
      loadFollowStates([viewingUserId]);
    }
  }, [isOwn, viewingUserId, loadFollowStates]);

  var [activeTab, setActiveTab] = useState("Posts");
  var [showAntiScroll, setShowAntiScroll] = useState(false);
  var scrollTimeRef = useRef(0);
  var scrollIntervalRef = useRef(null);

  /* Anti-scroll timer */
  useEffect(function () {
    scrollIntervalRef.current = setInterval(function () {
      scrollTimeRef.current += 1;
      if (scrollTimeRef.current >= 600 && !showAntiScroll) {
        setShowAntiScroll(true);
      }
    }, 1000);
    return function () { clearInterval(scrollIntervalRef.current); };
  }, [showAntiScroll]);

  var dismissAntiScroll = useCallback(function () {
    setShowAntiScroll(false);
    scrollTimeRef.current = 0;
  }, []);

  /* Achievement count */
  var earnedCount = useMemo(function () {
    return achievements.filter(function (a) { return a.earned; }).length;
  }, [achievements]);

  /* Handlers */
  var handleFollow = useCallback(function () {
    if (viewingUserId) follow(viewingUserId);
  }, [viewingUserId, follow]);

  var handleUnfollow = useCallback(function () {
    if (viewingUserId) unfollow(viewingUserId);
  }, [viewingUserId, unfollow]);

  var handleEditProfile = useCallback(function () {
    navigate("/settings");
  }, [navigate]);

  /* Loading */
  if (loading) {
    return (
      <DashboardLayout pageTitle="PROFILE">
        <div className="prf-content">
          <div className="prf-loading">
            <div className="prf-loading-pulse" />
            <span>Loading profile...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!profileData) {
    return (
      <DashboardLayout pageTitle="PROFILE">
        <div className="prf-content">
          <div className="prf-empty"><p>Profile not found.</p></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle={isOwn ? "PROFILE" : profileData.identity.toUpperCase()}>
      <div className="prf-content">
        <motion.div className="prf-container" variants={stagger} initial="hidden" animate="visible">
          {/* Hero */}
          <HeroSection
            data={profileData}
            isOwn={isOwn}
            followStatus={followState.status}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onEditProfile={handleEditProfile}
          />

          {/* Tabs */}
          <div className="prf-tabs">
            {TABS.map(function (tab) {
              return (
                <button key={tab} className={"prf-tab" + (activeTab === tab ? " active" : "")} onClick={function () { setActiveTab(tab); }}>
                  {tab}
                  {tab === "Achievements" && earnedCount > 0 && <span className="prf-tab-badge">{earnedCount}</span>}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === "Posts" && (
              <motion.div key="posts" className="prf-tab-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                {isOwn && <ComposePost onPost={createPost} loading={postingLoading} />}
                {posts.length > 0 ? (
                  <motion.div className="prf-posts-list" variants={stagger} initial="hidden" animate="visible">
                    {posts.map(function (post) {
                      return (
                        <PostCard
                          key={post.id}
                          post={post}
                          liked={myLikes.has(post.id)}
                          reposted={myReposts.has(post.id)}
                          onLike={toggleLike}
                          onRepost={toggleRepost}
                          onDelete={deletePost}
                          isOwn={isOwn}
                        />
                      );
                    })}
                  </motion.div>
                ) : (
                  <EmptyState tab="Posts" isOwn={isOwn} />
                )}
              </motion.div>
            )}

            {activeTab === "Focus Logs" && (
              <motion.div key="logs" className="prf-tab-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                {focusLogs.length > 0 ? (
                  <motion.div className="prf-logs-list" variants={stagger} initial="hidden" animate="visible">
                    {focusLogs.map(function (log) {
                      return <FocusLogCard key={log.id} log={log} />;
                    })}
                  </motion.div>
                ) : (
                  <EmptyState tab="Focus Logs" isOwn={isOwn} />
                )}
              </motion.div>
            )}

            {activeTab === "Achievements" && (
              <motion.div key="achievements" className="prf-tab-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                {achievements.length > 0 ? (
                  <motion.div className="prf-achievements-grid" variants={stagger} initial="hidden" animate="visible">
                    {achievements.map(function (ach) {
                      return <AchievementCard key={ach.id} achievement={ach} />;
                    })}
                  </motion.div>
                ) : (
                  <EmptyState tab="Achievements" isOwn={isOwn} />
                )}
              </motion.div>
            )}

            {activeTab === "Stats" && (
              <motion.div key="stats" className="prf-tab-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                {stats && (stats.heatmap.some(function (d) { return d.active; }) || stats.xpCurve.length > 1) ? (
                  <StatsTab stats={stats} />
                ) : (
                  <EmptyState tab="Stats" isOwn={isOwn} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {showAntiScroll && <AntiScrollOverlay onDismiss={dismissAntiScroll} />}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
