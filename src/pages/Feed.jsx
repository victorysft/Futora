import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useFeed } from "../hooks/useFeed";
import { useFeedIntel } from "../hooks/useFeedIntel";
import { useFollowing } from "../hooks/useFollowing";
import { supabase } from "../supabaseClient";
import "./Feed.css";

/* ═══════════════════════════════════════════
   FUTORA · Feed v2 — Full Width Social Pulse
   3-Column: Sidebar | Feed (900px) | Intel (400px)
   ═══════════════════════════════════════════ */

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};
const likeBounce = {
  scale: [1, 1.3, 1],
  transition: { duration: 0.3 },
};

const TABS = [
  { key: "for-you", label: "For You" },
  { key: "following", label: "Following" },
  { key: "trending", label: "Trending" },
];

const POST_TYPE_MAP = {
  progress: { label: "Progress", color: "#10B981", icon: "📈" },
  reflection: { label: "Reflection", color: "#8B5CF6", icon: "💭" },
  mission: { label: "Mission", color: "#3B82F6", icon: "🎯" },
};

function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getLevelTitle(xp) {
  const level = Math.floor(Math.sqrt((xp || 0) / 50));
  const T = ["Newcomer","Initiate","Apprentice","Disciple","Builder","Sentinel","Architect","Commander","Master","Sovereign","Apex"];
  return T[Math.min(level, T.length - 1)];
}

/* ══════════════════════════════════════════════════════════
   SKELETON LOADER
   ══════════════════════════════════════════════════════════ */
const SkeletonPost = memo(function SkeletonPost() {
  return (
    <div className="fd-post fd-skeleton">
      <div className="fd-skel-header">
        <div className="fd-skel-avatar" />
        <div className="fd-skel-lines">
          <div className="fd-skel-line w60" />
          <div className="fd-skel-line w40" />
        </div>
      </div>
      <div className="fd-skel-line w100" />
      <div className="fd-skel-line w80" />
      <div className="fd-skel-line w50" />
    </div>
  );
});

function FeedSkeletons() {
  return (
    <div className="fd-posts">
      <SkeletonPost />
      <SkeletonPost />
      <SkeletonPost />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   COMPOSE BOX (Sticky)
   ══════════════════════════════════════════════════════════ */
const ComposeBox = memo(function ComposeBox({ onPost, composeRef }) {
  const [type, setType] = useState("reflection");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const inputRef = useRef(null);

  // Expose focus method
  useEffect(() => {
    if (composeRef) composeRef.current = { focus: () => inputRef.current?.focus() };
  }, [composeRef]);

  const handlePost = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);
    await onPost(type, content);
    setContent("");
    setPosting(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handlePost();
  };

  return (
    <div className="fd-compose fd-sticky-compose">
      <div className="fd-compose-types">
        {Object.entries(POST_TYPE_MAP).map(([key, cfg]) => (
          <button
            key={key}
            className={`fd-type-btn${type === key ? " active" : ""}`}
            onClick={() => setType(key)}
            style={{ "--type-color": cfg.color }}
          >
            <span>{cfg.icon}</span> {cfg.label}
          </button>
        ))}
      </div>
      <textarea
        ref={inputRef}
        className="fd-compose-input"
        placeholder="Share a thought, progress update, or mission… (Ctrl+Enter to post)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={600}
        rows={3}
      />
      <div className="fd-compose-footer">
        <span className="fd-char-count">{content.length}/600</span>
        <button className="fd-post-btn" onClick={handlePost} disabled={!content.trim() || posting}>
          {posting ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
});

/* ══════════════════════════════════════════════════════════
   VERIFIED BADGE (with glow for high rep)
   ══════════════════════════════════════════════════════════ */
function VerifiedBadge({ xp }) {
  const isHighRep = (xp || 0) >= 500;
  return (
    <svg
      className={`fd-verified${isHighRep ? " fd-verified-glow" : ""}`}
      width="14" height="14" viewBox="0 0 16 16" fill="none"
    >
      <path d="M8 0L9.8 2.4L12.8 2L12.4 5L15 6.8L13.2 9.2L14 12L11.2 12.4L9.8 15L8 13L6.2 15L4.8 12.4L2 12L2.8 9.2L1 6.8L3.6 5L3.2 2L6.2 2.4L8 0Z" fill="#3B82F6" />
      <path d="M6.5 8.5L7.5 9.5L10 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════
   POST CARD
   ══════════════════════════════════════════════════════════ */
const PostCard = memo(function PostCard({ post, userId, onLike, onRepost, onReport, onReply }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);

  const isLiked = (post.post_likes || []).some((l) => l.user_id === userId);
  const isReposted = (post.post_reposts || []).some((r) => r.user_id === userId);
  const author = post.profiles || {};
  const typeCfg = POST_TYPE_MAP[post.type] || POST_TYPE_MAP.reflection;
  const isHighRep = (author.xp || 0) >= 500;

  const handleLike = () => {
    setLikeAnim(true);
    onLike(post.id);
    setTimeout(() => setLikeAnim(false), 350);
  };

  const handleReply = async () => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    await onReply(post.id, replyText);
    setReplyText("");
    setShowReply(false);
    setReplying(false);
  };

  return (
    <motion.div
      className={`fd-post${isHighRep ? " fd-post-highrep" : ""}`}
      variants={fadeUp}
    >
      {/* Header */}
      <div className="fd-post-header">
        <div className={`fd-post-avatar${isHighRep ? " fd-avatar-glow" : ""}`}>
          {(author.identity || "?")[0].toUpperCase()}
        </div>
        <div className="fd-post-meta">
          <div className="fd-post-author-row">
            <span className="fd-post-author">{author.identity || "Anonymous"}</span>
            {author.verified && <VerifiedBadge xp={author.xp} />}
            <span className="fd-post-level">
              Lv.{author.level || 0} · {getLevelTitle(author.xp)}
            </span>
          </div>
          <div className="fd-post-time-row">
            <span className="fd-post-type-tag" style={{ background: typeCfg.color + "18", color: typeCfg.color }}>
              {typeCfg.icon} {typeCfg.label}
            </span>
            {author.streak > 0 && (
              <span className="fd-post-streak">🔥 {author.streak}d</span>
            )}
            <span className="fd-post-time">{timeAgo(post.created_at)}</span>
          </div>
        </div>
        <div className="fd-post-menu-wrap">
          <button className="fd-post-menu-btn" onClick={() => setShowMenu(!showMenu)}>⋮</button>
          {showMenu && (
            <div className="fd-post-dropdown">
              <button onClick={() => { onReport(post.id, "spam"); setShowMenu(false); }}>Report Spam</button>
              <button onClick={() => { onReport(post.id, "toxic"); setShowMenu(false); }}>Report Toxic</button>
              <button onClick={() => { onReport(post.id, "low_effort"); setShowMenu(false); }}>Low Effort</button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <p className="fd-post-content">{post.content}</p>

      {/* Actions */}
      <div className="fd-post-actions">
        <motion.button
          className={`fd-action-btn${isLiked ? " liked" : ""}`}
          onClick={handleLike}
          animate={likeAnim ? likeBounce : {}}
        >
          <span className="fd-action-icon">{isLiked ? "❤️" : "🤍"}</span>
          <span>{post.likes_count || 0}</span>
        </motion.button>
        <button className="fd-action-btn" onClick={() => setShowReply(!showReply)}>
          <span className="fd-action-icon">💬</span>
          <span>{post.replies_count || 0}</span>
        </button>
        <button
          className={`fd-action-btn${isReposted ? " reposted" : ""}`}
          onClick={() => onRepost(post.id)}
        >
          <span className="fd-action-icon">🔁</span>
          <span>{post.reposts_count || 0}</span>
        </button>
      </div>

      {/* Reply box */}
      <AnimatePresence>
        {showReply && (
          <motion.div
            className="fd-reply-box"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <input
              className="fd-reply-input"
              placeholder="Write a reply…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReply()}
              maxLength={300}
              autoFocus
            />
            <button className="fd-reply-send" onClick={handleReply} disabled={!replyText.trim() || replying}>
              {replying ? "…" : "↵"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Replies preview */}
      {post.post_replies?.length > 0 && (
        <div className="fd-replies-preview">
          {post.post_replies.slice(0, 3).map((r) => (
            <div key={r.id} className="fd-reply-item">
              <span className="fd-reply-author">{r.profiles?.identity || "User"}</span>
              <span className="fd-reply-text">{r.content}</span>
            </div>
          ))}
          {post.post_replies.length > 3 && (
            <span className="fd-more-replies">+ {post.post_replies.length - 3} more</span>
          )}
        </div>
      )}
    </motion.div>
  );
});

/* ══════════════════════════════════════════════════════════
   NEW POSTS BANNER (Sticky)
   ══════════════════════════════════════════════════════════ */
function NewPostsBanner({ count, onClick }) {
  if (count === 0) return null;
  return (
    <motion.button
      className="fd-new-banner"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      onClick={onClick}
    >
      {count} new post{count > 1 ? "s" : ""} — click to load
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════════════
   ANTI-SCROLL MODAL
   ══════════════════════════════════════════════════════════ */
function AntiScrollModal({ onDismiss, onFocus }) {
  return (
    <motion.div
      className="fd-antiscroll-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="fd-antiscroll-modal"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <span className="fd-antiscroll-icon">⏱️</span>
        <h3>You've been scrolling for 15 minutes</h3>
        <p>Time to create, not consume. Start a focus session or take a break.</p>
        <div className="fd-antiscroll-actions">
          <button className="fd-antiscroll-focus" onClick={onFocus}>Start Focus</button>
          <button className="fd-antiscroll-dismiss" onClick={onDismiss}>Continue</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   RIGHT PANEL — Intelligence sidebar
   ══════════════════════════════════════════════════════════ */
const RightPanel = memo(function RightPanel({ suggestedUsers, trendingCommunities, leaderboard, userId }) {
  const navigate = useNavigate();

  return (
    <aside className="fd-right-panel">
      {/* Suggested Users */}
      <div className="fd-intel-card">
        <h3 className="fd-intel-title">Suggested Users</h3>
        <div className="fd-intel-list">
          {suggestedUsers.length === 0 && <span className="fd-intel-empty">No suggestions yet</span>}
          {suggestedUsers.map((u) => (
            <div key={u.id} className="fd-intel-user">
              <div className={`fd-intel-avatar${(u.xp || 0) >= 500 ? " fd-avatar-glow" : ""}`}>
                {(u.identity || "?")[0].toUpperCase()}
              </div>
              <div className="fd-intel-user-info">
                <span className="fd-intel-user-name">
                  {u.identity || "User"}
                  {u.verified && <VerifiedBadge xp={u.xp} />}
                </span>
                <span className="fd-intel-user-meta">
                  {u.streak > 0 && `🔥 ${u.streak}d · `}Lv.{u.level || 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trending Communities */}
      <div className="fd-intel-card">
        <h3 className="fd-intel-title">Trending Communities</h3>
        <div className="fd-intel-list">
          {trendingCommunities.length === 0 && <span className="fd-intel-empty">No communities yet</span>}
          {trendingCommunities.map((c) => (
            <div
              key={c.id}
              className="fd-intel-community"
              onClick={() => navigate(`/communities/${c.slug || c.id}`)}
            >
              <span className="fd-intel-comm-name">{c.name}</span>
              <span className="fd-intel-comm-members">{c.members_count || 0} members</span>
            </div>
          ))}
        </div>
      </div>

      {/* Discipline Leaderboard */}
      <div className="fd-intel-card">
        <h3 className="fd-intel-title">Discipline Leaderboard</h3>
        <div className="fd-intel-list">
          {leaderboard.map((u, i) => (
            <div key={u.id} className="fd-intel-lb-row">
              <span className="fd-intel-lb-rank">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
              </span>
              <span className="fd-intel-lb-name">{u.identity || "User"}</span>
              <span className="fd-intel-lb-xp">{u.xp || 0} XP</span>
            </div>
          ))}
        </div>
      </div>

      {/* Start Focus CTA */}
      <div className="fd-intel-card fd-intel-cta">
        <span className="fd-cta-icon">🎯</span>
        <h4 className="fd-cta-title">Ready to focus?</h4>
        <p className="fd-cta-text">Stop scrolling, start building discipline.</p>
        <button className="fd-cta-btn" onClick={() => navigate("/focus")}>
          Start Focus Session
        </button>
      </div>
    </aside>
  );
});

/* ══════════════════════════════════════════════════════════
   FEED PAGE — 3 Column Layout
   ══════════════════════════════════════════════════════════ */
export default function Feed() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  const { following } = useFollowing(userId);
  const followingIds = useMemo(
    () => (following || []).map((f) => f.following_id),
    [following]
  );

  const {
    posts, loading, hasMore, tab, setTab,
    newCount, loadNew, loadMore,
    likePost, repostPost, reportPost, createPost, replyToPost,
  } = useFeed(userId, followingIds);

  const { suggestedUsers, trendingCommunities, leaderboard } = useFeedIntel(userId, followingIds);

  const sentinelRef = useRef(null);
  const composeRef = useRef(null);

  // ── Anti-scroll system ──
  const [showAntiScroll, setShowAntiScroll] = useState(false);
  const scrollTimerRef = useRef(null);
  const scrollStartRef = useRef(Date.now());

  useEffect(() => {
    scrollStartRef.current = Date.now();
    scrollTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - scrollStartRef.current) / 1000;
      if (elapsed >= 900) { // 15 minutes
        setShowAntiScroll(true);
        clearInterval(scrollTimerRef.current);
        // Log scroll session
        if (userId) {
          supabase.from("scroll_sessions").insert({
            user_id: userId,
            duration_sec: Math.floor(elapsed),
            page: "feed",
          }).then(() => {});
        }
      }
    }, 30000); // check every 30s
    return () => clearInterval(scrollTimerRef.current);
  }, [userId]);

  const dismissAntiScroll = () => {
    setShowAntiScroll(false);
    scrollStartRef.current = Date.now(); // reset timer
    scrollTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - scrollStartRef.current) / 1000;
      if (elapsed >= 900) {
        setShowAntiScroll(true);
        clearInterval(scrollTimerRef.current);
      }
    }, 30000);
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKey = (e) => {
      // Don't trigger when typing in input/textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        composeRef.current?.focus();
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        navigate("/focus");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navigate]);

  // ── Infinite scroll ──
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) loadMore(); },
      { rootMargin: "300px" }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  return (
    <DashboardLayout>
      <div className="fd-page">
        {/* ═══ MAIN FEED COLUMN ═══ */}
        <div className="fd-main-col">
          {/* Header */}
          <motion.div
            className="fd-header"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="fd-title">Feed</h1>
            <p className="fd-subtitle">Your community's pulse</p>
            <div className="fd-shortcuts-hint">
              <kbd>N</kbd> New post · <kbd>F</kbd> Focus
            </div>
          </motion.div>

          {/* Tabs with gradient divider */}
          <div className="fd-tabs-wrap">
            <div className="fd-tabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`fd-tab${tab === t.key ? " active" : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="fd-tabs-gradient" />
          </div>

          {/* New posts banner */}
          <NewPostsBanner count={newCount} onClick={loadNew} />

          {/* Compose (sticky) */}
          <ComposeBox onPost={createPost} composeRef={composeRef} />

          {/* Posts — single stable container, no remount on tab change */}
          <div className="fd-feed-container">
            {loading && posts.length === 0 ? (
              <FeedSkeletons />
            ) : posts.length === 0 ? (
              <div className="fd-empty">
                <span className="fd-empty-icon">📡</span>
                <h3>No posts yet</h3>
                <p>{tab === "following" ? "Follow others to see their posts here" : "Be the first to share something"}</p>
              </div>
            ) : (
              <motion.div
                className="fd-posts"
                variants={stagger}
                initial="hidden"
                animate="visible"
              >
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    userId={userId}
                    onLike={likePost}
                    onRepost={repostPost}
                    onReport={reportPost}
                    onReply={replyToPost}
                  />
                ))}
              </motion.div>
            )}

            {hasMore && <div ref={sentinelRef} className="fd-sentinel" />}

            {loading && posts.length > 0 && (
              <div className="fd-loading-more">
                <div className="fd-spinner small" />
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT INTELLIGENCE PANEL ═══ */}
        <RightPanel
          suggestedUsers={suggestedUsers}
          trendingCommunities={trendingCommunities}
          leaderboard={leaderboard}
          userId={userId}
        />
      </div>

      {/* Anti-scroll modal */}
      <AnimatePresence>
        {showAntiScroll && (
          <AntiScrollModal
            onDismiss={dismissAntiScroll}
            onFocus={() => navigate("/focus")}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
