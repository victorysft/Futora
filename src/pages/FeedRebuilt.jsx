import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useFeedEngine } from "../hooks/useFeedEngine";
import { useNotificationsEngine } from "../hooks/useNotificationsEngine";
import { useFeedIntel } from "../hooks/useFeedIntel";
import "./FeedRebuilt.css";

/* ═══════════════════════════════════════════════
   FUTORA Feed — Complete Rebuild
   No emojis. No clutter. Clean SVG icons only.
   ═══════════════════════════════════════════════ */

/* ── SVG Icons (Lucide-style) ── */
const Icons = {
  heart: (filled) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={filled ? "#EF4444" : "none"} stroke={filled ? "#EF4444" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  comment: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  bookmark: (filled) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={filled ? "#8B5CF6" : "none"} stroke={filled ? "#8B5CF6" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  moreVertical: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  alertTriangle: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  arrowUp: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  trendingUp: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
};

/* ── Animation presets ── */
const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

const TABS = [
  { key: "for-you", label: "For You" },
  { key: "following", label: "Following" },
  { key: "trending", label: "Trending" },
];

const DISCIPLINES = [
  "Fitness", "Coding", "Reading", "Meditation", "Writing",
  "Study", "Business", "Art", "Music", "Language",
];

/* ── Utilities ── */
function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 604800) return Math.floor(s / 86400) + "d";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getLevelTitle(xp) {
  const level = Math.floor(Math.sqrt((xp || 0) / 50));
  const T = ["Newcomer","Initiate","Apprentice","Disciple","Builder","Sentinel","Architect","Commander","Master","Sovereign","Apex"];
  return T[Math.min(level, T.length - 1)];
}

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

/* ═══ AVATAR ═══ */
function UserAvatar({ identity, avatarUrl, size = 40, glow = false, onClick }) {
  if (avatarUrl) {
    return (
      <img
        className={"feed-avatar" + (glow ? " feed-avatar--glow" : "")}
        src={avatarUrl}
        alt={identity}
        style={{ width: size, height: size }}
        onClick={onClick}
      />
    );
  }
  return (
    <div
      className={"feed-avatar feed-avatar--initials" + (glow ? " feed-avatar--glow" : "")}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      onClick={onClick}
    >
      {(identity || "?")[0].toUpperCase()}
    </div>
  );
}

/* ═══ VERIFIED BADGE ═══ */
function VerifiedBadge({ xp }) {
  return (
    <svg className={"feed-verified" + ((xp || 0) >= 500 ? " feed-verified--glow" : "")} width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 0L9.8 2.4L12.8 2L12.4 5L15 6.8L13.2 9.2L14 12L11.2 12.4L9.8 15L8 13L6.2 15L4.8 12.4L2 12L2.8 9.2L1 6.8L3.6 5L3.2 2L6.2 2.4L8 0Z" fill="#8B5CF6" />
      <path d="M6.5 8.5L7.5 9.5L10 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══ SKELETON ═══ */
const SkeletonPost = memo(function SkeletonPost() {
  return (
    <div className="feed-post feed-skeleton">
      <div className="feed-skel-row">
        <div className="feed-skel-avatar" />
        <div className="feed-skel-lines">
          <div className="feed-skel-line w55" />
          <div className="feed-skel-line w35" />
        </div>
      </div>
      <div className="feed-skel-line w100" />
      <div className="feed-skel-line w75" />
      <div className="feed-skel-line w45" />
    </div>
  );
});

/* ═══ COMPOSE BOX ═══ */
const ComposeBox = memo(function ComposeBox({ profile, onPost, composeRef }) {
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [discipline, setDiscipline] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaPreviews, setMediaPreviews] = useState([]);
  const [showDisciplines, setShowDisciplines] = useState(false);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (composeRef) composeRef.current = { focus: () => inputRef.current && inputRef.current.focus() };
  }, [composeRef]);

  const handleMediaSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const hasVideo = files.some((f) => f.type.startsWith("video/"));
    const allowed = hasVideo
      ? [files.find((f) => f.type.startsWith("video/"))].filter(Boolean)
      : files.slice(0, 4);
    setMediaFiles(allowed);
    setMediaPreviews(allowed.map((f) => ({
      url: URL.createObjectURL(f),
      type: f.type.startsWith("video/") ? "video" : "image",
      name: f.name,
    })));
  };

  const removeMedia = (idx) => {
    URL.revokeObjectURL(mediaPreviews[idx].url);
    setMediaFiles((prev) => prev.filter((_, i) => i !== idx));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePost = async () => {
    if ((!content.trim() && mediaFiles.length === 0) || posting) return;
    setPosting(true);
    await onPost(content, {
      disciplineTag: discipline || null,
      visibility,
      mediaFiles,
    });
    setContent("");
    setMediaFiles([]);
    mediaPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    setMediaPreviews([]);
    setDiscipline("");
    setPosting(false);
    inputRef.current && inputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handlePost();
  };

  return (
    <div className="feed-compose">
      <div className="feed-compose__inner">
        <UserAvatar identity={profile?.identity} avatarUrl={profile?.avatar_url} size={42} />
        <div className="feed-compose__body">
          <textarea
            ref={inputRef}
            className="feed-compose__input"
            placeholder="Share your progress..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            rows={2}
          />
          {mediaPreviews.length > 0 && (
            <div className={"feed-media-preview feed-media-grid--" + mediaPreviews.length}>
              {mediaPreviews.map((m, i) => (
                <div key={i} className="feed-media-preview__item">
                  {m.type === "video" ? (
                    <video src={m.url} className="feed-media-thumb" muted />
                  ) : (
                    <img src={m.url} className="feed-media-thumb" alt="" />
                  )}
                  <button className="feed-media-remove" onClick={() => removeMedia(i)}>{Icons.x}</button>
                </div>
              ))}
            </div>
          )}
          <div className="feed-compose__toolbar">
            <div className="feed-compose__tools">
              <button className="feed-tool-btn" onClick={() => fileRef.current?.click()} title="Photo/Video">
                {Icons.image}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple onChange={handleMediaSelect} style={{ display: "none" }} />
              <div className="feed-discipline-wrap">
                <button className={"feed-tool-btn" + (discipline ? " active" : "")} onClick={() => setShowDisciplines(!showDisciplines)} title="Tag discipline">
                  {Icons.tag}
                  {discipline && <span className="feed-tool-label">{discipline}</span>}
                </button>
                {showDisciplines && (
                  <div className="feed-discipline-dropdown">
                    {DISCIPLINES.map((d) => (
                      <button key={d} className={"feed-discipline-opt" + (discipline === d ? " active" : "")} onClick={() => { setDiscipline(d === discipline ? "" : d); setShowDisciplines(false); }}>
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="feed-tool-btn" onClick={() => setVisibility(visibility === "public" ? "followers" : "public")} title={visibility === "public" ? "Public" : "Followers only"}>
                {visibility === "public" ? Icons.globe : Icons.lock}
              </button>
            </div>
            <div className="feed-compose__right">
              <span className="feed-char-count">{content.length}/2000</span>
              <button className="feed-post-btn" onClick={handlePost} disabled={(!content.trim() && mediaFiles.length === 0) || posting}>
                {posting ? "..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/* ═══ MEDIA GALLERY ═══ */
const MediaGallery = memo(function MediaGallery({ media }) {
  if (!media || media.length === 0) return null;
  return (
    <div className={"feed-gallery feed-gallery--" + Math.min(media.length, 4)}>
      {media.map((m) => (
        <div key={m.id} className="feed-gallery__item">
          {m.type === "video" ? (
            <video src={m.url} className="feed-gallery__media" controls muted playsInline preload="metadata" />
          ) : (
            <img src={m.url} className="feed-gallery__media" alt="" loading="lazy" />
          )}
        </div>
      ))}
    </div>
  );
});

/* ═══ POST CARD ═══ */
const PostCard = memo(function PostCard({
  post, userId, onLike, onBookmark, onComment, onDelete,
  onReport, isBookmarked, navigate, onView,
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);
  const postRef = useRef(null);
  const viewedRef = useRef(false);

  const isLiked = (post.likes || []).some((l) => l.user_id === userId);
  const author = post.author || {};
  const isOwn = post.user_id === userId;

  // View tracking
  useEffect(() => {
    if (!postRef.current || viewedRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !viewedRef.current) {
        viewedRef.current = true;
        onView?.(post.id);
      }
    }, { threshold: 0.5 });
    obs.observe(postRef.current);
    return () => obs.disconnect();
  }, [post.id, onView]);

  const handleLike = () => {
    setLikeAnim(true);
    onLike(post.id);
    setTimeout(() => setLikeAnim(false), 350);
  };

  const handleComment = async () => {
    if (!commentText.trim() || commenting) return;
    setCommenting(true);
    await onComment(post.id, commentText);
    setCommentText("");
    setCommenting(false);
  };

  const goToProfile = () => navigate("/profile/" + author.id);

  const allComments = post.comments || [];
  const rootComments = allComments.filter((c) => !c.parent_comment_id);

  return (
    <motion.article ref={postRef} className="feed-post" variants={fadeUp}>
      {/* Header */}
      <div className="feed-post__header">
        <UserAvatar identity={author.identity} avatarUrl={author.avatar_url} size={42} glow={(author.xp || 0) >= 500} onClick={goToProfile} />
        <div className="feed-post__meta" onClick={goToProfile} style={{ cursor: "pointer" }}>
          <div className="feed-post__namerow">
            <span className="feed-post__name">{author.identity || "Anonymous"}</span>
            {author.verified && <VerifiedBadge xp={author.xp} />}
            <span className="feed-post__handle">Lv.{author.level || 0} · {getLevelTitle(author.xp)}</span>
            <span className="feed-post__dot">·</span>
            <span className="feed-post__time">{timeAgo(post.created_at)}</span>
          </div>
          {post.discipline_tag && (
            <div className="feed-post__tagrow">
              <span className="feed-discipline-badge">{post.discipline_tag}</span>
            </div>
          )}
        </div>
        <div className="feed-post__menu-wrap">
          <button className="feed-menu-btn" onClick={() => setShowMenu(!showMenu)}>
            {Icons.moreVertical}
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div className="feed-dropdown" initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}>
                {isOwn && (
                  <button onClick={() => { onDelete?.(post.id); setShowMenu(false); }}>
                    {Icons.trash} <span>Delete</span>
                  </button>
                )}
                <button onClick={() => { onReport(post.id, "spam"); setShowMenu(false); }}>
                  {Icons.flag} <span>Report spam</span>
                </button>
                <button onClick={() => { onReport(post.id, "toxic"); setShowMenu(false); }}>
                  {Icons.alertTriangle} <span>Report toxic</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Content */}
      <p className="feed-post__content">{post.content}</p>
      <MediaGallery media={post.media} />

      {/* Actions */}
      <div className="feed-actions">
        <motion.button
          className={"feed-act" + (isLiked ? " feed-act--liked" : "")}
          onClick={handleLike}
          animate={likeAnim ? { scale: [1, 1.25, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          {Icons.heart(isLiked)}
          <span>{formatCount(post.like_count)}</span>
        </motion.button>

        <button className="feed-act" onClick={() => setShowComments(!showComments)}>
          {Icons.comment}
          <span>{formatCount(post.comment_count)}</span>
        </button>

        <button className={"feed-act" + (isBookmarked ? " feed-act--bookmarked" : "")} onClick={() => onBookmark(post.id)}>
          {Icons.bookmark(isBookmarked)}
        </button>

        <div className="feed-act feed-act--views">
          {Icons.eye}
          <span>{formatCount(post.view_count)}</span>
        </div>
      </div>

      {/* Comments */}
      <AnimatePresence>
        {showComments && (
          <motion.div className="feed-comments" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="feed-comment-input-row">
              <input
                className="feed-comment-input"
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleComment(); }}
                maxLength={1000}
                autoFocus
              />
              <button className="feed-comment-send" onClick={handleComment} disabled={!commentText.trim() || commenting}>
                {Icons.send}
              </button>
            </div>
            {rootComments.length > 0 && (
              <div className="feed-comments__list">
                {rootComments.slice(0, 5).map((c) => {
                  const cAuthor = c.author || {};
                  const nested = allComments.filter((nc) => nc.parent_comment_id === c.id);
                  return (
                    <div key={c.id} className="feed-comment">
                      <div className="feed-comment__row">
                        <UserAvatar identity={cAuthor.identity} avatarUrl={cAuthor.avatar_url} size={28} onClick={() => navigate("/profile/" + cAuthor.id)} />
                        <div className="feed-comment__body">
                          <div className="feed-comment__header">
                            <span className="feed-comment__name" onClick={() => navigate("/profile/" + cAuthor.id)}>{cAuthor.identity || "User"}</span>
                            {cAuthor.verified && <VerifiedBadge xp={cAuthor.xp} />}
                            <span className="feed-comment__time">{timeAgo(c.created_at)}</span>
                          </div>
                          <p className="feed-comment__text">{c.content}</p>
                        </div>
                      </div>
                      {nested.length > 0 && (
                        <div className="feed-nested-comments">
                          {nested.slice(0, 3).map((nr) => {
                            const nrAuthor = nr.author || {};
                            return (
                              <div key={nr.id} className="feed-comment feed-comment--nested">
                                <div className="feed-comment__row">
                                  <UserAvatar identity={nrAuthor.identity} avatarUrl={nrAuthor.avatar_url} size={24} onClick={() => navigate("/profile/" + nrAuthor.id)} />
                                  <div className="feed-comment__body">
                                    <div className="feed-comment__header">
                                      <span className="feed-comment__name">{nrAuthor.identity || "User"}</span>
                                      <span className="feed-comment__time">{timeAgo(nr.created_at)}</span>
                                    </div>
                                    <p className="feed-comment__text">{nr.content}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {rootComments.length > 5 && (
                  <button className="feed-more-comments">View {rootComments.length - 5} more comments</button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
});

/* ═══ NEW POSTS BANNER ═══ */
function NewPostsBanner({ count, onClick }) {
  if (count === 0) return null;
  return (
    <motion.button className="feed-new-banner" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={onClick}>
      {Icons.arrowUp} {count} new post{count > 1 ? "s" : ""}
    </motion.button>
  );
}

/* ═══ NOTIFICATION PANEL ═══ */
const NotificationPanel = memo(function NotificationPanel({ userId }) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationsEngine(userId);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const NOTIF_TYPE_LABEL = {
    like: "liked your post",
    comment: "commented on your post",
    follow: "started following you",
    repost: "reposted your post",
    mention: "mentioned you",
  };

  return (
    <div className="feed-notif-wrap">
      <button className="feed-notif-bell" onClick={() => setOpen(!open)}>
        {Icons.bell}
        {unreadCount > 0 && <span className="feed-notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="feed-notif-panel" initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }}>
            <div className="feed-notif-header">
              <h3>Notifications</h3>
              {unreadCount > 0 && <button className="feed-notif-markall" onClick={markAllRead}>Mark all read</button>}
            </div>
            <div className="feed-notif-list">
              {notifications.length === 0 ? (
                <div className="feed-notif-empty">No notifications yet</div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={"feed-notif-item" + (n.is_read ? "" : " feed-notif--unread")}
                    onClick={() => {
                      markRead(n.id);
                      if (n.post_id) navigate("/feed");
                      else if (n.type === "follow") navigate("/profile/" + n.actor_id);
                      setOpen(false);
                    }}
                  >
                    <div className="feed-notif-body">
                      <span className="feed-notif-actor">{n.actor?.identity || "Someone"}</span>{" "}
                      <span className="feed-notif-text">{NOTIF_TYPE_LABEL[n.type] || "interacted"}</span>
                      {n.post?.content && (
                        <span className="feed-notif-excerpt">
                          {n.post.content.slice(0, 60)}{n.post.content.length > 60 ? "..." : ""}
                        </span>
                      )}
                    </div>
                    <span className="feed-notif-time">{timeAgo(n.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/* ═══ ANTI-SCROLL MODAL ═══ */
function AntiScrollModal({ onDismiss, onFocus }) {
  return (
    <motion.div className="feed-antiscroll-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="feed-antiscroll-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        {Icons.clock}
        <h3>15 minutes of scrolling</h3>
        <p>Time to create, not consume.</p>
        <div className="feed-antiscroll-btns">
          <button className="feed-antiscroll-focus" onClick={onFocus}>Start Focus</button>
          <button className="feed-antiscroll-dismiss" onClick={onDismiss}>Continue</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══ RIGHT PANEL ═══ */
const RightPanel = memo(function RightPanel({ suggestedUsers, trendingCommunities, leaderboard }) {
  const navigate = useNavigate();
  return (
    <aside className="feed-right">
      <div className="feed-search-box">
        {Icons.search}
        <input className="feed-search-input" placeholder="Search FUTORA" />
      </div>

      {/* Who to follow */}
      <div className="feed-panel-card">
        <h3 className="feed-panel-title">Who to follow</h3>
        {suggestedUsers.length === 0 && <span className="feed-panel-empty">No suggestions yet</span>}
        {suggestedUsers.slice(0, 4).map((u) => (
          <div key={u.id} className="feed-suggest-user" onClick={() => navigate("/profile/" + u.id)}>
            <UserAvatar identity={u.identity} avatarUrl={u.avatar_url} size={36} glow={(u.xp || 0) >= 500} />
            <div className="feed-suggest-info">
              <div className="feed-suggest-name">{u.identity || "User"} {u.verified && <VerifiedBadge xp={u.xp} />}</div>
              <div className="feed-suggest-meta">Lv.{u.level || 0}</div>
            </div>
            <button className="feed-follow-btn" onClick={(e) => e.stopPropagation()}>Follow</button>
          </div>
        ))}
        {suggestedUsers.length > 0 && <button className="feed-show-more" onClick={() => navigate("/network")}>Show more</button>}
      </div>

      {/* Trending Communities */}
      <div className="feed-panel-card">
        <h3 className="feed-panel-title">Trending Communities</h3>
        {trendingCommunities.slice(0, 4).map((c) => (
          <div key={c.id} className="feed-trend-item" onClick={() => navigate("/communities/" + (c.slug || c.id))}>
            <span className="feed-trend-name">{c.name}</span>
            <span className="feed-trend-count">{c.members_count || 0} members</span>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="feed-panel-card">
        <h3 className="feed-panel-title">Discipline Leaderboard</h3>
        {leaderboard.map((u, i) => (
          <div key={u.id} className="feed-lb-row" onClick={() => navigate("/profile/" + u.id)}>
            <span className="feed-lb-rank">#{i + 1}</span>
            <span className="feed-lb-name">{u.identity || "User"}</span>
            <span className="feed-lb-xp">{formatCount(u.xp)} XP</span>
          </div>
        ))}
      </div>

      {/* Focus CTA */}
      <div className="feed-panel-card feed-focus-cta">
        <h4>Ready to focus?</h4>
        <p>Stop scrolling. Start building.</p>
        <button className="feed-cta-btn" onClick={() => navigate("/focus")}>Start Focus</button>
      </div>
    </aside>
  );
});

/* ═══════════════════════════════════════════════
   FEED PAGE — Main Export
   ═══════════════════════════════════════════════ */
export default function FeedRebuilt() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;

  const {
    posts, loading, hasMore, tab, setTab,
    newCount, loadNew, loadMore,
    createPost, likePost, bookmarkPost, bookmarkedIds,
    addComment, deletePost, reportPost, recordView,
  } = useFeedEngine(userId);

  const { suggestedUsers, trendingCommunities, leaderboard } = useFeedIntel(userId, []);

  const sentinelRef = useRef(null);
  const composeRef = useRef(null);

  const [showAntiScroll, setShowAntiScroll] = useState(false);
  const scrollTimerRef = useRef(null);
  const scrollStartRef = useRef(Date.now());

  // Anti-scroll timer (15 min)
  useEffect(() => {
    scrollStartRef.current = Date.now();
    scrollTimerRef.current = setInterval(() => {
      if ((Date.now() - scrollStartRef.current) / 1000 >= 900) {
        setShowAntiScroll(true);
        clearInterval(scrollTimerRef.current);
      }
    }, 30000);
    return () => clearInterval(scrollTimerRef.current);
  }, [userId]);

  const dismissAntiScroll = () => {
    setShowAntiScroll(false);
    scrollStartRef.current = Date.now();
    scrollTimerRef.current = setInterval(() => {
      if ((Date.now() - scrollStartRef.current) / 1000 >= 900) {
        setShowAntiScroll(true);
        clearInterval(scrollTimerRef.current);
      }
    }, 30000);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); composeRef.current?.focus(); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); navigate("/focus"); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navigate]);

  // Infinite scroll via IntersectionObserver
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreRef.current) loadMoreRef.current();
    }, { rootMargin: "300px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <DashboardLayout>
      <div className="feed-page">
        <div className="feed-main">
          {/* Top bar */}
          <div className="feed-topbar">
            <h1 className="feed-logo">Feed</h1>
            <div className="feed-topbar__right">
              <NotificationPanel userId={userId} />
            </div>
          </div>

          {/* Tabs */}
          <div className="feed-tabs">
            {TABS.map((t) => (
              <button key={t.key} className={"feed-tab" + (tab === t.key ? " active" : "")} onClick={() => setTab(t.key)}>
                {t.label}
                {tab === t.key && <motion.div className="feed-tab__indicator" layoutId="feedTabLine" />}
              </button>
            ))}
          </div>

          <NewPostsBanner count={newCount} onClick={loadNew} />
          <ComposeBox profile={profile} onPost={createPost} composeRef={composeRef} />

          {/* Feed content */}
          <div className="feed-container">
            {loading && posts.length === 0 ? (
              <div className="feed-skeletons">
                <SkeletonPost /><SkeletonPost /><SkeletonPost />
              </div>
            ) : posts.length === 0 ? (
              <div className="feed-empty-cta" style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ width: 48, height: 48, margin: "0 auto 16px", opacity: 0.5 }}>{Icons.pen}</div>
                <h3 style={{ color: "var(--d-text)", fontSize: 18, marginBottom: 8 }}>Share your first update</h3>
                <p style={{ color: "var(--d-text-muted)", fontSize: 14, marginBottom: 20 }}>Write what you are working on today. Your post will appear instantly.</p>
                <button className="feed-cta-btn" onClick={() => composeRef.current?.focus()} style={{ background: "var(--d-purple)", color: "#fff", border: "none", padding: "10px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Start writing</button>
              </div>
            ) : (
              <motion.div className="feed-posts" variants={stagger} initial="hidden" animate="visible">
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    userId={userId}
                    onLike={likePost}
                    onBookmark={bookmarkPost}
                    isBookmarked={bookmarkedIds.has(p.id)}
                    onComment={addComment}
                    onDelete={deletePost}
                    onReport={reportPost}
                    onView={recordView}
                    navigate={navigate}
                  />
                ))}
              </motion.div>
            )}
            {hasMore && <div ref={sentinelRef} className="feed-sentinel" />}
            {loading && posts.length > 0 && <div className="feed-loading-more"><div className="feed-spinner" /></div>}
          </div>
        </div>

        <RightPanel suggestedUsers={suggestedUsers} trendingCommunities={trendingCommunities} leaderboard={leaderboard} />
      </div>

      <AnimatePresence>
        {showAntiScroll && <AntiScrollModal onDismiss={dismissAntiScroll} onFocus={() => navigate("/focus")} />}
      </AnimatePresence>
    </DashboardLayout>
  );
}
