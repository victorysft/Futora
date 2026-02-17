import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useFeed } from "../hooks/useFeed";
import { useFollowing } from "../hooks/useFollowing";
import { supabase } from "../supabaseClient";
import "./Feed.css";

/* ═══════════════════════════════════════════
   FUTORA · Feed — Social Pulse Center
   ═══════════════════════════════════════════ */

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
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
  const level = Math.floor(Math.sqrt(xp / 50));
  const TITLES = [
    "Newcomer","Initiate","Apprentice","Disciple","Builder",
    "Sentinel","Architect","Commander","Master","Sovereign","Apex",
  ];
  return TITLES[Math.min(level, TITLES.length - 1)];
}

/* ══════════════════════════════════════════════════════════
   COMPOSE BOX
   ══════════════════════════════════════════════════════════ */
function ComposeBox({ onPost }) {
  const [type, setType] = useState("reflection");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const ref = useRef(null);

  const handlePost = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);
    await onPost(type, content);
    setContent("");
    setPosting(false);
    ref.current?.focus();
  };

  return (
    <motion.div className="fd-compose" variants={fadeUp}>
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
        ref={ref}
        className="fd-compose-input"
        placeholder="Share a thought, progress update, or mission…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={600}
        rows={3}
      />
      <div className="fd-compose-footer">
        <span className="fd-char-count">{content.length}/600</span>
        <button
          className="fd-post-btn"
          onClick={handlePost}
          disabled={!content.trim() || posting}
        >
          {posting ? "Posting…" : "Post"}
        </button>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   POST CARD
   ══════════════════════════════════════════════════════════ */
function PostCard({ post, userId, onLike, onRepost, onReport, onReply }) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isLiked = (post.post_likes || []).some((l) => l.user_id === userId);
  const isReposted = (post.post_reposts || []).some((r) => r.user_id === userId);
  const author = post.profiles || {};
  const typeCfg = POST_TYPE_MAP[post.type] || POST_TYPE_MAP.reflection;

  const handleReply = async () => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    await onReply(post.id, replyText);
    setReplyText("");
    setShowReply(false);
    setReplying(false);
  };

  return (
    <motion.div className="fd-post" variants={fadeUp}>
      {/* Header */}
      <div className="fd-post-header">
        <div className="fd-post-avatar">
          {(author.identity || "?")[0].toUpperCase()}
        </div>
        <div className="fd-post-meta">
          <div className="fd-post-author-row">
            <span className="fd-post-author">{author.identity || "Anonymous"}</span>
            {author.verified && (
              <svg className="fd-verified" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 0L9.8 2.4L12.8 2L12.4 5L15 6.8L13.2 9.2L14 12L11.2 12.4L9.8 15L8 13L6.2 15L4.8 12.4L2 12L2.8 9.2L1 6.8L3.6 5L3.2 2L6.2 2.4L8 0Z" fill="#3B82F6" />
                <path d="M6.5 8.5L7.5 9.5L10 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className="fd-post-level">
              Lv.{author.level || 0} · {getLevelTitle(author.xp || 0)}
            </span>
          </div>
          <div className="fd-post-time-row">
            <span className="fd-post-type-tag" style={{ background: typeCfg.color + "18", color: typeCfg.color }}>
              {typeCfg.icon} {typeCfg.label}
            </span>
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
        <button
          className={`fd-action-btn${isLiked ? " liked" : ""}`}
          onClick={() => onLike(post.id)}
        >
          <span className="fd-action-icon">{isLiked ? "❤️" : "🤍"}</span>
          <span>{post.likes_count || 0}</span>
        </button>
        <button
          className="fd-action-btn"
          onClick={() => setShowReply(!showReply)}
        >
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
              maxLength={300}
            />
            <button
              className="fd-reply-send"
              onClick={handleReply}
              disabled={!replyText.trim() || replying}
            >
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
}

/* ══════════════════════════════════════════════════════════
   NEW POSTS BANNER
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
      {count} new post{count > 1 ? "s" : ""} — tap to load
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════════════
   FEED PAGE
   ══════════════════════════════════════════════════════════ */
export default function Feed() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const { following } = useFollowing(userId);
  const followingIds = (following || []).map((f) => f.following_id);

  const {
    posts,
    loading,
    hasMore,
    tab,
    setTab,
    newCount,
    loadNew,
    loadMore,
    likePost,
    repostPost,
    reportPost,
    createPost,
  } = useFeed(userId, followingIds);

  const replyToPost = useCallback(async (postId, content) => {
    await supabase.from("post_replies").insert({
      post_id: postId,
      user_id: userId,
      content: content.trim(),
    });
  }, [userId]);

  const sentinelRef = useRef(null);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) loadMore(); },
      { rootMargin: "200px" }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  return (
    <DashboardLayout>
      <div className="fd-page">
        {/* Header */}
        <motion.div
          className="fd-header"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="fd-title">Feed</h1>
          <p className="fd-subtitle">Your community's pulse</p>
        </motion.div>

        {/* Tabs */}
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

        {/* New posts banner */}
        <NewPostsBanner count={newCount} onClick={loadNew} />

        {/* Compose */}
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <ComposeBox onPost={createPost} />
        </motion.div>

        {/* Posts */}
        <motion.div
          className="fd-posts"
          variants={stagger}
          initial="hidden"
          animate="visible"
          key={tab}
        >
          {loading && posts.length === 0 ? (
            <div className="fd-loading">
              <div className="fd-spinner" />
              <span>Loading feed…</span>
            </div>
          ) : posts.length === 0 ? (
            <div className="fd-empty">
              <span className="fd-empty-icon">📡</span>
              <h3>No posts yet</h3>
              <p>{tab === "following" ? "Follow others to see their posts here" : "Be the first to share something"}</p>
            </div>
          ) : (
            posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                userId={userId}
                onLike={likePost}
                onRepost={repostPost}
                onReport={reportPost}
                onReply={replyToPost}
              />
            ))
          )}

          {/* Sentinel for infinite scroll */}
          {hasMore && <div ref={sentinelRef} className="fd-sentinel" />}

          {loading && posts.length > 0 && (
            <div className="fd-loading-more">
              <div className="fd-spinner small" />
            </div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
