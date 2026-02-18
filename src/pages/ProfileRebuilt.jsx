import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useProfilePage, getLevelTitle } from "../hooks/useProfilePage";
import { useFollowEngine } from "../hooks/useFollowEngine";
import "./ProfileRebuilt.css";

/* ═══════════════════════════════════════════════
   FUTORA Profile — Complete Rebuild
   No emojis. Clean SVG icons only. Purple accent.
   ═══════════════════════════════════════════════ */

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const TABS = ["Posts", "Focus Logs", "Achievements", "Stats"];

/* ── SVG Icons ── */
const Icons = {
  mapPin: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
  trendingUp: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  award: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  barChart: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  heart: (filled) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? "#EF4444" : "none"} stroke={filled ? "#EF4444" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  messageCircle: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  repeat: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
};

/* ── Utils ── */
function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
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
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? h + "h " + m + "m" : h + "h";
}

/* ═══ USER AVATAR ═══ */
function UserAvatar({ identity, avatarUrl, size, onClick, showRing }) {
  size = size || 64;
  const letter = (identity || "?")[0].toUpperCase();

  if (avatarUrl) {
    return (
      <div className={"prf-avatar" + (showRing ? " prf-avatar-with-ring" : "")} style={{ width: size, height: size, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
        <img src={avatarUrl} alt={identity} className="prf-avatar-img" style={{ width: size, height: size }} />
        {showRing && <div className="prf-avatar-ring" />}
      </div>
    );
  }

  return (
    <div className={"prf-avatar" + (showRing ? " prf-avatar-with-ring" : "")} style={{ width: size, height: size, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <span className="prf-avatar-letter" style={{ fontSize: size * 0.4 }}>{letter}</span>
      {showRing && <div className="prf-avatar-ring" />}
    </div>
  );
}

/* ═══ VERIFIED BADGE ═══ */
function VerifiedBadge({ badgeType }) {
  const title = badgeType === "centurion" ? "100+ Focus Hours" : badgeType === "iron_streak" ? "30-Day Streak" : "Verified";
  return (
    <span className="prf-verified-badge" title={title}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 0L9.8 2.4L12.8 2L12.4 5L15 6.8L13.2 9.2L14 12L11.2 12.4L9.8 15L8 13L6.2 15L4.8 12.4L2 12L2.8 9.2L1 6.8L3.6 5L3.2 2L6.2 2.4L8 0Z" fill="#8B5CF6" />
        <path d="M6.5 8.5L7.5 9.5L10 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ═══ XP BAR ═══ */
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

/* ═══ FOLLOW BUTTON ═══ */
function FollowButton({ status, onFollow, onUnfollow }) {
  const [hover, setHover] = useState(false);

  if (status === "self") return null;

  if (status === "accepted") {
    return (
      <button
        className={"prf-follow-btn following" + (hover ? " unfollow-hover" : "")}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onUnfollow}
      >
        {hover ? "Unfollow" : "Following"}
      </button>
    );
  }

  return (
    <button className="prf-follow-btn" onClick={onFollow}>Follow</button>
  );
}

/* ═══ DISCIPLINE TAG ═══ */
function DisciplineTag({ discipline }) {
  if (!discipline) return null;
  return (
    <span className="prf-discipline-tag">{discipline}</span>
  );
}

/* ═══ HERO SECTION ═══ */
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
          <p className="prf-mission-text">{Icons.target} {data.missionStatement || data.focus}</p>
        )}
        <div className="prf-meta-row">
          {data.location && <span className="prf-meta-item">{Icons.mapPin} {data.location}</span>}
          {data.memberSince && <span className="prf-meta-item">{Icons.calendar} Joined {data.memberSince}</span>}
          {data.commitmentLevel && <span className="prf-meta-item">{Icons.zap} {data.commitmentLevel}</span>}
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

      {/* Stats */}
      <div className="prf-stats-strip">
        <StatItem value={data.streak} label="Streak" icon={Icons.trendingUp} />
        <div className="prf-stat-divider" />
        <StatItem value={data.focusScore} label="Focus Score" />
        <div className="prf-stat-divider" />
        <StatItem value={"#" + (data.rank || "--")} label="Rank" />
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
      <span className="prf-stat-value">{icon && <span className="prf-stat-icon">{icon}</span>}{value}</span>
      <span className="prf-stat-label">{label}</span>
    </div>
  );
}

/* ═══ COMPOSE POST ═══ */
function ComposePost({ onPost, loading }) {
  const [content, setContent] = useState("");
  const [type, setType] = useState("reflection");

  const handleSubmit = async () => {
    if (!content.trim() || loading) return;
    const result = await onPost(type, content);
    if (result) { setContent(""); setType("reflection"); }
  };

  return (
    <div className="prf-compose">
      <textarea
        className="prf-compose-input"
        placeholder="Share a reflection or progress update..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
        rows={3}
        maxLength={500}
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

/* ═══ POST CARD ═══ */
function PostCard({ post, liked, reposted, onLike, onRepost, onDelete, isOwn }) {
  return (
    <motion.div className="prf-post" variants={fadeUp}>
      <div className="prf-post-header">
        {post.discipline_tag && <span className="prf-post-tag">{post.discipline_tag}</span>}
        <span className="prf-post-time">{timeAgo(post.created_at)}</span>
      </div>
      <p className="prf-post-content">{post.content}</p>
      <div className="prf-post-actions">
        <button className={"prf-action-btn" + (liked ? " active" : "")} onClick={() => onLike(post.id)}>
          {Icons.heart(liked)}
          {post.likes_count > 0 && <span>{post.likes_count}</span>}
        </button>
        <button className="prf-action-btn">
          {Icons.messageCircle}
          {post.replies_count > 0 && <span>{post.replies_count}</span>}
        </button>
        <button className={"prf-action-btn" + (reposted ? " active repost" : "")} onClick={() => onRepost(post.id)}>
          {Icons.repeat}
          {post.reposts_count > 0 && <span>{post.reposts_count}</span>}
        </button>
        {isOwn && (
          <button className="prf-action-btn delete" onClick={() => onDelete(post.id)}>
            {Icons.trash}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ═══ FOCUS LOG CARD ═══ */
function FocusLogCard({ log }) {
  return (
    <motion.div className="prf-focus-log" variants={fadeUp}>
      <div className="prf-log-icon">{Icons.zap}</div>
      <div className="prf-log-body">
        <span className="prf-log-name">{log.focusName}</span>
        <span className="prf-log-meta">{fmtDuration(log.duration)} · +{log.xpEarned} XP</span>
      </div>
      <span className="prf-log-date">{fmtDate(log.date)}</span>
    </motion.div>
  );
}

/* ═══ ACHIEVEMENT CARD ═══ */
function AchievementCard({ achievement }) {
  return (
    <motion.div className={"prf-achievement" + (achievement.earned ? "" : " locked")} variants={fadeUp}>
      <span className="prf-ach-icon">{achievement.earned ? Icons.award : Icons.lock}</span>
      <span className="prf-ach-label">{achievement.label}</span>
    </motion.div>
  );
}

/* ═══ STATS TAB ═══ */
function StatsTab({ stats }) {
  if (!stats) return null;
  const heatmap = stats.heatmap;
  const xpCurve = stats.xpCurve;

  const maxMin = Math.max(...heatmap.map((d) => d.minutes), 1);
  const getIntensity = (minutes) => {
    if (minutes === 0) return 0;
    if (minutes <= maxMin * 0.25) return 1;
    if (minutes <= maxMin * 0.5) return 2;
    if (minutes <= maxMin * 0.75) return 3;
    return 4;
  };

  const W = 560, H = 100, PAD = 16;

  const xpPath = useMemo(() => {
    if (!xpCurve.length) return { line: "", area: "" };
    const maxXP = Math.max(...xpCurve.map((d) => d.xp), 1);
    const step = (W - PAD * 2) / Math.max(xpCurve.length - 1, 1);
    const pts = xpCurve.map((d, i) => ({
      x: PAD + i * step,
      y: H - PAD - (d.xp / maxXP) * (H - PAD * 2),
    }));
    if (pts.length < 2) return { line: "", area: "" };
    let line = "M " + pts[0].x + " " + pts[0].y;
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i].x + pts[i + 1].x) / 2;
      line += " C " + cx + " " + pts[i].y + ", " + cx + " " + pts[i + 1].y + ", " + pts[i + 1].x + " " + pts[i + 1].y;
    }
    const area = line + " L " + pts[pts.length - 1].x + " " + (H - PAD) + " L " + pts[0].x + " " + (H - PAD) + " Z";
    return { line, area };
  }, [xpCurve]);

  return (
    <motion.div className="prf-stats-tab" variants={stagger} initial="hidden" animate="visible">
      <motion.div className="prf-card prf-heatmap-card" variants={fadeUp}>
        <h3 className="prf-card-title">30-Day Activity</h3>
        <div className="prf-heatmap-grid">
          {heatmap.map((day) => (
            <div key={day.date} className={"prf-heat-cell intensity-" + getIntensity(day.minutes)} title={fmtDate(day.date) + ": " + day.minutes + "m"} />
          ))}
        </div>
        <div className="prf-heatmap-legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className={"prf-heat-cell legend intensity-" + i} />)}
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
            <span>{xpCurve[0]?.xp || 0} XP</span>
            <span>{xpCurve[xpCurve.length - 1]?.xp || 0} XP</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ═══ EMPTY STATE ═══ */
function EmptyState({ tab, isOwn }) {
  const msgs = {
    Posts: isOwn ? "No posts yet. Share your first update." : "This user hasn't posted yet.",
    "Focus Logs": isOwn ? "No focus sessions recorded. Start a session to track progress." : "No focus sessions to show.",
    Achievements: isOwn ? "Keep building to unlock achievements." : "No achievements unlocked yet.",
    Stats: isOwn ? "Not enough data yet. Check in daily." : "Not enough data to display.",
  };
  return (
    <div className="prf-empty">
      <p>{msgs[tab] || "Nothing here yet."}</p>
    </div>
  );
}

/* ═══ ANTI-SCROLL ═══ */
function AntiScrollOverlay({ onDismiss }) {
  return (
    <motion.div className="prf-anti-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="prf-anti-scroll-inner">
        {Icons.clock}
        <h3>Time to Refocus</h3>
        <p>You have been scrolling for a while. Take a moment to reflect.</p>
        <div className="prf-anti-scroll-actions">
          <button className="prf-anti-btn primary" onClick={onDismiss}>Back to Profile</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PROFILE PAGE
   ═══════════════════════════════════════════════ */
export default function ProfileRebuilt() {
  const { user } = useAuth();
  const params = useParams();
  const navigate = useNavigate();

  const viewingUserId = params.userId || user?.id;
  const isOwn = !params.userId || params.userId === user?.id;

  const {
    loading, profileData, posts, focusLogs, achievements, stats,
    myLikes, myReposts, postingLoading,
    createPost, deletePost, toggleLike, toggleRepost,
  } = useProfilePage(viewingUserId);

  const { getFollowState, followUser, unfollowUser, fetchFollowStates } = useFollowEngine(user?.id);

  const followState = useMemo(() => {
    if (isOwn || !viewingUserId) return { status: "self", loading: false };
    return getFollowState(viewingUserId);
  }, [isOwn, viewingUserId, getFollowState]);

  useEffect(() => {
    if (!isOwn && viewingUserId && fetchFollowStates) {
      fetchFollowStates([viewingUserId]);
    }
  }, [isOwn, viewingUserId, fetchFollowStates]);

  const [activeTab, setActiveTab] = useState("Posts");
  const [showAntiScroll, setShowAntiScroll] = useState(false);
  const scrollTimeRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      scrollTimeRef.current += 1;
      if (scrollTimeRef.current >= 600 && !showAntiScroll) {
        setShowAntiScroll(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [showAntiScroll]);

  const dismissAntiScroll = useCallback(() => {
    setShowAntiScroll(false);
    scrollTimeRef.current = 0;
  }, []);

  const earnedCount = useMemo(() => achievements.filter((a) => a.earned).length, [achievements]);

  const handleFollow = useCallback(() => {
    if (viewingUserId) followUser(viewingUserId);
  }, [viewingUserId, followUser]);

  const handleUnfollow = useCallback(() => {
    if (viewingUserId) unfollowUser(viewingUserId);
  }, [viewingUserId, unfollowUser]);

  if (loading) {
    return (
      <DashboardLayout pageTitle="PROFILE">
        <div className="prf-content">
          <div className="prf-loading"><div className="prf-loading-pulse" /><span>Loading profile...</span></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!profileData) {
    return (
      <DashboardLayout pageTitle="PROFILE">
        <div className="prf-content"><div className="prf-empty"><p>Profile not found.</p></div></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle={isOwn ? "PROFILE" : profileData.identity.toUpperCase()}>
      <div className="prf-content">
        <motion.div className="prf-container" variants={stagger} initial="hidden" animate="visible">
          <HeroSection
            data={profileData}
            isOwn={isOwn}
            followStatus={followState.status}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onEditProfile={() => navigate("/settings")}
          />

          {/* Tabs */}
          <div className="prf-tabs">
            {TABS.map((tab) => (
              <button key={tab} className={"prf-tab" + (activeTab === tab ? " active" : "")} onClick={() => setActiveTab(tab)}>
                {tab}
                {tab === "Achievements" && earnedCount > 0 && <span className="prf-tab-badge">{earnedCount}</span>}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === "Posts" && (
              <motion.div key="posts" className="prf-tab-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {isOwn && <ComposePost onPost={createPost} loading={postingLoading} />}
                {posts.length > 0 ? (
                  <motion.div className="prf-posts-list" variants={stagger} initial="hidden" animate="visible">
                    {posts.map((post) => (
                      <PostCard key={post.id} post={post} liked={myLikes.has(post.id)} reposted={myReposts.has(post.id)} onLike={toggleLike} onRepost={toggleRepost} onDelete={deletePost} isOwn={isOwn} />
                    ))}
                  </motion.div>
                ) : (
                  <EmptyState tab="Posts" isOwn={isOwn} />
                )}
              </motion.div>
            )}

            {activeTab === "Focus Logs" && (
              <motion.div key="logs" className="prf-tab-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {focusLogs.length > 0 ? (
                  <motion.div className="prf-logs-list" variants={stagger} initial="hidden" animate="visible">
                    {focusLogs.map((log) => <FocusLogCard key={log.id} log={log} />)}
                  </motion.div>
                ) : (
                  <EmptyState tab="Focus Logs" isOwn={isOwn} />
                )}
              </motion.div>
            )}

            {activeTab === "Achievements" && (
              <motion.div key="achievements" className="prf-tab-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {achievements.length > 0 ? (
                  <motion.div className="prf-achievements-grid" variants={stagger} initial="hidden" animate="visible">
                    {achievements.map((ach) => <AchievementCard key={ach.id} achievement={ach} />)}
                  </motion.div>
                ) : (
                  <EmptyState tab="Achievements" isOwn={isOwn} />
                )}
              </motion.div>
            )}

            {activeTab === "Stats" && (
              <motion.div key="stats" className="prf-tab-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {stats && (stats.heatmap.some((d) => d.active) || stats.xpCurve.length > 1) ? (
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
