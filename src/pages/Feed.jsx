import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useFeedV4 } from "../hooks/useFeedV4";
import { useFeedIntel } from "../hooks/useFeedIntel";
import { useFollowing } from "../hooks/useFollowing";
import { useNotifications } from "../hooks/useNotifications";
import "./Feed.css";

/* ===========================================
   FUTORA Feed 2.0 - X-Style Social Pulse
   Clean discipline. No noise.
   =========================================== */

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

const POST_TYPES = {
  progress: { label: "Progress", color: "#10B981", icon: "\u{1F4C8}" },
  reflection: { label: "Reflection", color: "#8B5CF6", icon: "\u{1F4AD}" },
  mission: { label: "Mission", color: "#3B82F6", icon: "\u{1F3AF}" },
};

const DISCIPLINES = [
  "Fitness", "Coding", "Reading", "Meditation", "Writing",
  "Study", "Business", "Art", "Music", "Language",
];

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

/* == AVATAR == */
function UserAvatar({ identity, avatarUrl, size = 40, glow = false, onClick }) {
  if (avatarUrl) {
    return (
      <img
        className={"fd2-avatar" + (glow ? " fd2-avatar-glow" : "")}
        src={avatarUrl}
        alt={identity}
        style={{ width: size, height: size }}
        onClick={onClick}
      />
    );
  }
  return (
    <div
      className={"fd2-avatar fd2-avatar-initials" + (glow ? " fd2-avatar-glow" : "")}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      onClick={onClick}
    >
      {(identity || "?")[0].toUpperCase()}
    </div>
  );
}

/* == VERIFIED BADGE == */
function VerifiedBadge({ xp }) {
  return (
    <svg
      className={"fd2-verified" + ((xp || 0) >= 500 ? " fd2-verified-glow" : "")}
      width="14" height="14" viewBox="0 0 16 16" fill="none"
    >
      <path d="M8 0L9.8 2.4L12.8 2L12.4 5L15 6.8L13.2 9.2L14 12L11.2 12.4L9.8 15L8 13L6.2 15L4.8 12.4L2 12L2.8 9.2L1 6.8L3.6 5L3.2 2L6.2 2.4L8 0Z" fill="#8B5CF6" />
      <path d="M6.5 8.5L7.5 9.5L10 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* == SKELETON == */
const SkeletonPost = memo(function SkeletonPost() {
  return (
    <div className="fd2-post fd2-skeleton">
      <div className="fd2-skel-row">
        <div className="fd2-skel-avatar" />
        <div className="fd2-skel-lines">
          <div className="fd2-skel-line w55" />
          <div className="fd2-skel-line w35" />
        </div>
      </div>
      <div className="fd2-skel-line w100" />
      <div className="fd2-skel-line w75" />
      <div className="fd2-skel-line w45" />
    </div>
  );
});

/* ===============================================
   COMPOSE BOX (X-style Tweet box)
   =============================================== */
const ComposeBox = memo(function ComposeBox({ profile, onPost, composeRef }) {
  const [type, setType] = useState("reflection");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [discipline, setDiscipline] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaPreviews, setMediaPreviews] = useState([]);
  const [showDisciplines, setShowDisciplines] = useState(false);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(function() {
    if (composeRef) composeRef.current = { focus: function() { inputRef.current && inputRef.current.focus(); } };
  }, [composeRef]);

  const handleMediaSelect = function(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const hasVideo = files.some(function(f) { return f.type.startsWith("video/"); });
    const allowed = hasVideo ? [files.find(function(f) { return f.type.startsWith("video/"); })].filter(Boolean) : files.slice(0, 4);
    setMediaFiles(allowed);
    setMediaPreviews(allowed.map(function(f) {
      return { url: URL.createObjectURL(f), type: f.type.startsWith("video/") ? "video" : "image", name: f.name };
    }));
  };

  const removeMedia = function(idx) {
    URL.revokeObjectURL(mediaPreviews[idx].url);
    setMediaFiles(function(prev) { return prev.filter(function(_, i) { return i !== idx; }); });
    setMediaPreviews(function(prev) { return prev.filter(function(_, i) { return i !== idx; }); });
  };

  const handlePost = async function() {
    if ((!content.trim() && mediaFiles.length === 0) || posting) return;
    setPosting(true);
    await onPost(type, content, { disciplineTag: discipline || null, visibility: visibility, mediaFiles: mediaFiles });
    setContent("");
    setMediaFiles([]);
    mediaPreviews.forEach(function(p) { URL.revokeObjectURL(p.url); });
    setMediaPreviews([]);
    setDiscipline("");
    setPosting(false);
    inputRef.current && inputRef.current.focus();
  };

  const handleKeyDown = function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handlePost();
  };

  return (
    <div className="fd2-compose">
      <div className="fd2-compose-inner">
        <UserAvatar identity={profile && profile.identity} avatarUrl={profile && profile.avatar_url} size={42} />
        <div className="fd2-compose-body">
          <textarea
            ref={inputRef}
            className="fd2-compose-input"
            placeholder="Share progress, reflection or mission update..."
            value={content}
            onChange={function(e) { setContent(e.target.value); }}
            onKeyDown={handleKeyDown}
            maxLength={600}
            rows={2}
          />
          {mediaPreviews.length > 0 && (
            <div className={"fd2-media-preview fd2-media-grid-" + mediaPreviews.length}>
              {mediaPreviews.map(function(m, i) {
                return (
                  <div key={i} className="fd2-media-preview-item">
                    {m.type === "video" ? (
                      <video src={m.url} className="fd2-media-thumb" muted />
                    ) : (
                      <img src={m.url} className="fd2-media-thumb" alt="" />
                    )}
                    <button className="fd2-media-remove" onClick={function() { removeMedia(i); }}>{"\u00D7"}</button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="fd2-compose-toolbar">
            <div className="fd2-compose-tools">
              <div className="fd2-type-pills">
                {Object.entries(POST_TYPES).map(function([key, cfg]) {
                  return (
                    <button
                      key={key}
                      className={"fd2-type-pill" + (type === key ? " active" : "")}
                      onClick={function() { setType(key); }}
                      style={{ "--tc": cfg.color }}
                    >
                      {cfg.icon}
                    </button>
                  );
                })}
              </div>
              <div className="fd2-compose-divider" />
              <button className="fd2-tool-btn" onClick={function() { fileRef.current && fileRef.current.click(); }} title="Photo/Video">
                {"\u{1F4F7}"}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple onChange={handleMediaSelect} style={{ display: "none" }} />
              <div className="fd2-discipline-wrap">
                <button className={"fd2-tool-btn" + (discipline ? " active" : "")} onClick={function() { setShowDisciplines(!showDisciplines); }} title="Tag discipline">
                  {"\u{1F3F7}\uFE0F"} {discipline || ""}
                </button>
                {showDisciplines && (
                  <div className="fd2-discipline-dropdown">
                    {DISCIPLINES.map(function(d) {
                      return (
                        <button key={d} className={"fd2-discipline-opt" + (discipline === d ? " active" : "")} onClick={function() { setDiscipline(d === discipline ? "" : d); setShowDisciplines(false); }}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button className="fd2-tool-btn" onClick={function() { setVisibility(visibility === "public" ? "community" : "public"); }} title={visibility === "public" ? "Public" : "Community only"}>
                {visibility === "public" ? "\u{1F310}" : "\u{1F512}"}
              </button>
              <button className="fd2-tool-btn fd2-ai-btn" title="AI assist">
                {"\u{1F9E0}"}
              </button>
            </div>
            <div className="fd2-compose-right">
              <span className="fd2-char-count">{content.length}/600</span>
              <button className="fd2-post-btn" onClick={handlePost} disabled={(!content.trim() && mediaFiles.length === 0) || posting}>
                {posting ? "..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/* == MEDIA GALLERY == */
const MediaGallery = memo(function MediaGallery({ media }) {
  if (!media || media.length === 0) return null;
  return (
    <div className={"fd2-gallery fd2-gallery-" + Math.min(media.length, 4)}>
      {media.map(function(m) {
        return (
          <div key={m.id} className="fd2-gallery-item">
            {m.media_type === "video" ? (
              <video src={m.url} className="fd2-gallery-media" controls muted playsInline preload="metadata" poster={m.thumbnail || undefined} />
            ) : (
              <img src={m.url} className="fd2-gallery-media" alt="" loading="lazy" />
            )}
          </div>
        );
      })}
    </div>
  );
});

/* ===============================================
   POST CARD (X-style)
   =============================================== */
const PostCard = memo(function PostCard(props) {
  var post = props.post, userId = props.userId, onLike = props.onLike, onRepost = props.onRepost;
  var onBookmark = props.onBookmark, onReport = props.onReport, onReply = props.onReply, onDelete = props.onDelete;
  var isBookmarked = props.isBookmarked, navigate = props.navigate, onView = props.onView;

  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likeAnim, setLikeAnim] = useState(false);
  const postRef = useRef(null);
  const viewedRef = useRef(false);

  const isLiked = (post.post_likes || []).some(function(l) { return l.user_id === userId; });
  const isReposted = (post.post_reposts || []).some(function(r) { return r.user_id === userId; });
  const author = post.profiles || {};
  const typeCfg = POST_TYPES[post.type] || POST_TYPES.reflection;
  const isOwn = post.user_id === userId;

  useEffect(function() {
    if (!postRef.current || viewedRef.current) return;
    var obs = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting && !viewedRef.current) {
        viewedRef.current = true;
        onView && onView(post.id);
      }
    }, { threshold: 0.5 });
    obs.observe(postRef.current);
    return function() { obs.disconnect(); };
  }, [post.id, onView]);

  var handleLike = function() {
    setLikeAnim(true);
    onLike(post.id);
    setTimeout(function() { setLikeAnim(false); }, 350);
  };

  var handleReply = async function() {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    await onReply(post.id, replyText);
    setReplyText("");
    setShowReplyBox(false);
    setReplying(false);
  };

  var goToProfile = function() { navigate("/profile/" + author.id); };

  var allReplies = post.post_replies || [];
  var pinnedReplies = allReplies.filter(function(r) { return r.is_pinned; });
  var rootReplies = allReplies.filter(function(r) { return !r.parent_reply_id && !r.is_pinned; });
  var displayReplies = pinnedReplies.concat(rootReplies);

  return (
    <motion.article ref={postRef} className="fd2-post" variants={fadeUp}>
      <div className="fd2-post-header">
        <UserAvatar identity={author.identity} avatarUrl={author.avatar_url} size={42} glow={(author.xp || 0) >= 500} onClick={goToProfile} />
        <div className="fd2-post-meta" onClick={goToProfile} style={{cursor:"pointer"}}>
          <div className="fd2-post-namerow">
            <span className="fd2-post-name">{author.identity || "Anonymous"}</span>
            {author.verified && <VerifiedBadge xp={author.xp} />}
            <span className="fd2-post-handle">Lv.{author.level || 0} {"\u00B7"} {getLevelTitle(author.xp)}</span>
            <span className="fd2-post-dot">{"\u00B7"}</span>
            <span className="fd2-post-time">{timeAgo(post.created_at)}</span>
          </div>
          <div className="fd2-post-tagrow">
            <span className="fd2-post-type" style={{ "--tc": typeCfg.color }}>{typeCfg.icon} {typeCfg.label}</span>
            {post.discipline_tag && <span className="fd2-discipline-badge">{post.discipline_tag}</span>}
            {author.streak > 0 && <span className="fd2-streak-badge">{"\u{1F525}"} {author.streak}d</span>}
          </div>
        </div>
        <div className="fd2-post-menu-wrap">
          <button className="fd2-menu-btn" onClick={function() { setShowMenu(!showMenu); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div className="fd2-dropdown" initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}>
                {isOwn && <button onClick={function() { onDelete && onDelete(post.id); setShowMenu(false); }}>{"\u{1F5D1}\uFE0F"} Delete</button>}
                <button onClick={function() { onReport(post.id, "spam"); setShowMenu(false); }}>{"\u{1F6AB}"} Report spam</button>
                <button onClick={function() { onReport(post.id, "toxic"); setShowMenu(false); }}>{"\u26A0\uFE0F"} Report toxic</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="fd2-post-content">{post.content}</p>
      <MediaGallery media={post.post_media} />

      {(post.likes_count >= 5 || post.views_count >= 100) && (
        <div className="fd2-xp-earned">{"\u26A1"} +{Math.min(Math.floor((post.likes_count || 0) / 5) * 2, 20)} XP earned</div>
      )}

      <div className="fd2-actions">
        <motion.button className={"fd2-act" + (isLiked ? " fd2-liked" : "")} onClick={handleLike} animate={likeAnim ? { scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.3 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill={isLiked ? "#EF4444" : "none"} stroke={isLiked ? "#EF4444" : "currentColor"} strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          <span>{formatCount(post.likes_count)}</span>
        </motion.button>
        <button className="fd2-act" onClick={function() { setShowReplyBox(!showReplyBox); setShowComments(!showComments); }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <span>{formatCount(post.replies_count)}</span>
        </button>
        <button className={"fd2-act" + (isReposted ? " fd2-reposted" : "")} onClick={function() { onRepost(post.id); }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={isReposted ? "#10B981" : "currentColor"} strokeWidth="1.8"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
          <span>{formatCount(post.reposts_count)}</span>
        </button>
        <button className={"fd2-act" + (isBookmarked ? " fd2-bookmarked" : "")} onClick={function() { onBookmark(post.id); }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill={isBookmarked ? "#8B5CF6" : "none"} stroke={isBookmarked ? "#8B5CF6" : "currentColor"} strokeWidth="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
        </button>
        <div className="fd2-act fd2-views">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          <span>{formatCount(post.views_count)}</span>
        </div>
      </div>

      <AnimatePresence>
        {showReplyBox && (
          <motion.div className="fd2-reply-box" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <input className="fd2-reply-input" placeholder="Post your reply..." value={replyText} onChange={function(e) { setReplyText(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") handleReply(); }} maxLength={300} autoFocus />
            <button className="fd2-reply-send" onClick={handleReply} disabled={!replyText.trim() || replying}>{replying ? "..." : "Reply"}</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showComments && displayReplies.length > 0 && (
          <motion.div className="fd2-comments" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {displayReplies.slice(0, 5).map(function(r) {
              var rAuthor = r.profiles || {};
              var nestedReplies = allReplies.filter(function(nr) { return nr.parent_reply_id === r.id; });
              return (
                <div key={r.id} className={"fd2-comment" + (r.is_pinned ? " fd2-comment-pinned" : "")}>
                  {r.is_pinned && <span className="fd2-pinned-label">{"\u{1F4CC}"} Pinned</span>}
                  <div className="fd2-comment-row">
                    <UserAvatar identity={rAuthor.identity} avatarUrl={rAuthor.avatar_url} size={28} onClick={function() { navigate("/profile/" + rAuthor.id); }} />
                    <div className="fd2-comment-body">
                      <div className="fd2-comment-header">
                        <span className="fd2-comment-name" onClick={function() { navigate("/profile/" + rAuthor.id); }}>{rAuthor.identity || "User"}</span>
                        {rAuthor.verified && <VerifiedBadge xp={rAuthor.xp} />}
                        <span className="fd2-comment-level">Lv.{rAuthor.level || 0}</span>
                        <span className="fd2-comment-time">{timeAgo(r.created_at)}</span>
                      </div>
                      <p className="fd2-comment-text">{r.content}</p>
                      <div className="fd2-comment-actions">
                        <button className="fd2-comment-act">{"\u2764\uFE0F"} {r.likes_count || 0}</button>
                        <button className="fd2-comment-act">Reply</button>
                      </div>
                    </div>
                  </div>
                  {nestedReplies.length > 0 && (
                    <div className="fd2-nested-replies">
                      {nestedReplies.slice(0, 3).map(function(nr) {
                        var nrAuthor = nr.profiles || {};
                        return (
                          <div key={nr.id} className="fd2-comment fd2-comment-nested">
                            <div className="fd2-comment-row">
                              <UserAvatar identity={nrAuthor.identity} avatarUrl={nrAuthor.avatar_url} size={24} onClick={function() { navigate("/profile/" + nrAuthor.id); }} />
                              <div className="fd2-comment-body">
                                <div className="fd2-comment-header">
                                  <span className="fd2-comment-name">{nrAuthor.identity || "User"}</span>
                                  <span className="fd2-comment-time">{timeAgo(nr.created_at)}</span>
                                </div>
                                <p className="fd2-comment-text">{nr.content}</p>
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
            {displayReplies.length > 5 && <button className="fd2-more-comments">View {displayReplies.length - 5} more replies</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
});

/* == NEW POSTS BANNER == */
function NewPostsBanner({ count, onClick }) {
  if (count === 0) return null;
  return (
    <motion.button className="fd2-new-banner" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={onClick}>
      {"\u2191"} {count} new post{count > 1 ? "s" : ""}
    </motion.button>
  );
}

/* == NOTIFICATION PANEL == */
const NotificationPanel = memo(function NotificationPanel({ userId }) {
  const { notifications, unreadCount, markRead, markAllRead, NOTIF_ICONS, NOTIF_TEXT } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="fd2-notif-wrap">
      <button className="fd2-notif-bell" onClick={function() { setOpen(!open); }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {unreadCount > 0 && <span className="fd2-notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="fd2-notif-panel" initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }}>
            <div className="fd2-notif-header">
              <h3>Notifications</h3>
              {unreadCount > 0 && <button className="fd2-notif-markall" onClick={markAllRead}>Mark all read</button>}
            </div>
            <div className="fd2-notif-list">
              {notifications.length === 0 ? (
                <div className="fd2-notif-empty">No notifications yet</div>
              ) : (
                notifications.slice(0, 20).map(function(n) {
                  return (
                    <div key={n.id} className={"fd2-notif-item" + (n.is_read ? "" : " fd2-unread")} onClick={function() { markRead(n.id); if (n.post_id) navigate("/feed"); else if (n.type === "follow") navigate("/profile/" + n.actor_id); setOpen(false); }}>
                      <span className="fd2-notif-icon">{NOTIF_ICONS[n.type] || "\u{1F4EC}"}</span>
                      <div className="fd2-notif-body">
                        <span className="fd2-notif-actor">{n.actor && n.actor.identity || "Someone"}</span>{" "}
                        <span className="fd2-notif-text">{NOTIF_TEXT[n.type] || "interacted"}</span>
                        {n.post && n.post.content && <span className="fd2-notif-excerpt">{n.post.content.slice(0, 60)}{n.post.content.length > 60 ? "\u2026" : ""}</span>}
                      </div>
                      <span className="fd2-notif-time">{timeAgo(n.created_at)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/* == ANTI-SCROLL MODAL == */
function AntiScrollModal({ onDismiss, onFocus }) {
  return (
    <motion.div className="fd2-antiscroll-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="fd2-antiscroll-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <span className="fd2-antiscroll-icon">{"\u23F1\uFE0F"}</span>
        <h3>15 minutes of scrolling</h3>
        <p>Time to create, not consume.</p>
        <div className="fd2-antiscroll-btns">
          <button className="fd2-antiscroll-focus" onClick={onFocus}>Start Focus</button>
          <button className="fd2-antiscroll-dismiss" onClick={onDismiss}>Continue</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ===============================================
   RIGHT PANEL
   =============================================== */
const RightPanel = memo(function RightPanel({ suggestedUsers, trendingCommunities, leaderboard }) {
  const navigate = useNavigate();
  return (
    <aside className="fd2-right">
      <div className="fd2-search-box">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <input className="fd2-search-input" placeholder="Search FUTORA" />
      </div>
      <div className="fd2-panel-card">
        <h3 className="fd2-panel-title">Who to follow</h3>
        {suggestedUsers.length === 0 && <span className="fd2-panel-empty">No suggestions yet</span>}
        {suggestedUsers.slice(0, 4).map(function(u) {
          return (
            <div key={u.id} className="fd2-suggest-user" onClick={function() { navigate("/profile/" + u.id); }}>
              <UserAvatar identity={u.identity} avatarUrl={u.avatar_url} size={36} glow={(u.xp || 0) >= 500} />
              <div className="fd2-suggest-info">
                <div className="fd2-suggest-name">{u.identity || "User"} {u.verified && <VerifiedBadge xp={u.xp} />}</div>
                <div className="fd2-suggest-meta">{u.streak > 0 ? "\u{1F525} " + u.streak + "d \u00B7 " : ""}Lv.{u.level || 0}</div>
              </div>
              <button className="fd2-follow-btn" onClick={function(e) { e.stopPropagation(); }}>Follow</button>
            </div>
          );
        })}
        {suggestedUsers.length > 0 && <button className="fd2-show-more" onClick={function() { navigate("/network"); }}>Show more</button>}
      </div>
      <div className="fd2-panel-card">
        <h3 className="fd2-panel-title">Trending Communities</h3>
        {trendingCommunities.slice(0, 4).map(function(c) {
          return (
            <div key={c.id} className="fd2-trend-item" onClick={function() { navigate("/communities/" + (c.slug || c.id)); }}>
              <span className="fd2-trend-name">{c.name}</span>
              <span className="fd2-trend-count">{c.members_count || 0} members</span>
            </div>
          );
        })}
      </div>
      <div className="fd2-panel-card">
        <h3 className="fd2-panel-title">Discipline Leaderboard</h3>
        {leaderboard.map(function(u, i) {
          return (
            <div key={u.id} className="fd2-lb-row" onClick={function() { navigate("/profile/" + u.id); }}>
              <span className="fd2-lb-rank">{i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : "#" + (i + 1)}</span>
              <span className="fd2-lb-name">{u.identity || "User"}</span>
              <span className="fd2-lb-xp">{formatCount(u.xp)} XP</span>
            </div>
          );
        })}
      </div>
      <div className="fd2-panel-card fd2-focus-cta">
        <h4>Ready to focus?</h4>
        <p>Stop scrolling. Start building.</p>
        <button className="fd2-cta-btn" onClick={function() { navigate("/focus"); }}>Start Focus</button>
      </div>
    </aside>
  );
});

/* ===============================================
   FEED PAGE - Main Export
   =============================================== */
export default function Feed() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const userId = user && user.id;
  const { following } = useFollowing(userId);
  const followingIds = useMemo(
    function() { return (following || []).map(function(f) { return f.following_id; }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [(following || []).map(function(f) { return f.following_id; }).join(",")]
  );

  const {
    posts, loading, hasMore, tab, setTab,
    newCount, loadNew, loadMore,
    likePost, repostPost, bookmarkPost, bookmarkedIds,
    reportPost, createPost, deletePost, replyToPost, recordView,
  } = useFeedV4(userId, followingIds);

  const { suggestedUsers, trendingCommunities, leaderboard } = useFeedIntel(userId, followingIds);

  const sentinelRef = useRef(null);
  const composeRef = useRef(null);

  const [showAntiScroll, setShowAntiScroll] = useState(false);
  const scrollTimerRef = useRef(null);
  const scrollStartRef = useRef(Date.now());

  useEffect(function() {
    scrollStartRef.current = Date.now();
    scrollTimerRef.current = setInterval(function() {
      if ((Date.now() - scrollStartRef.current) / 1000 >= 900) {
        setShowAntiScroll(true);
        clearInterval(scrollTimerRef.current);
      }
    }, 30000);
    return function() { clearInterval(scrollTimerRef.current); };
  }, [userId]);

  var dismissAntiScroll = function() {
    setShowAntiScroll(false);
    scrollStartRef.current = Date.now();
    scrollTimerRef.current = setInterval(function() {
      if ((Date.now() - scrollStartRef.current) / 1000 >= 900) {
        setShowAntiScroll(true);
        clearInterval(scrollTimerRef.current);
      }
    }, 30000);
  };

  useEffect(function() {
    var handleKey = function(e) {
      if (["INPUT", "TEXTAREA", "SELECT"].indexOf(e.target.tagName) >= 0) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); composeRef.current && composeRef.current.focus(); }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); navigate("/focus"); }
    };
    window.addEventListener("keydown", handleKey);
    return function() { window.removeEventListener("keydown", handleKey); };
  }, [navigate]);

  var loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  var hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  useEffect(function() {
    if (!sentinelRef.current) return;
    var obs = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting && hasMoreRef.current) loadMoreRef.current();
    }, { rootMargin: "300px" });
    obs.observe(sentinelRef.current);
    return function() { obs.disconnect(); };
  }, []);

  return (
    <DashboardLayout>
      <div className="fd2-page">
        <div className="fd2-main">
          <div className="fd2-topbar">
            <h1 className="fd2-logo">Feed</h1>
            <div className="fd2-topbar-right">
              <NotificationPanel userId={userId} />
            </div>
          </div>
          <div className="fd2-tabs">
            {TABS.map(function(t) {
              return (
                <button key={t.key} className={"fd2-tab" + (tab === t.key ? " active" : "")} onClick={function() { setTab(t.key); }}>
                  {t.label}
                  {tab === t.key && <motion.div className="fd2-tab-indicator" layoutId="tabLine" />}
                </button>
              );
            })}
          </div>
          <NewPostsBanner count={newCount} onClick={loadNew} />
          <ComposeBox profile={profile} onPost={createPost} composeRef={composeRef} />
          <div className="fd2-feed-container">
            {loading && posts.length === 0 ? (
              <div className="fd2-skeletons"><SkeletonPost /><SkeletonPost /><SkeletonPost /></div>
            ) : posts.length === 0 ? (
              <div className="fd2-empty">
                <span className="fd2-empty-icon">{"\u{1F4E1}"}</span>
                <h3>No posts yet</h3>
                <p>{tab === "following" ? "Follow builders to see their posts" : "Be the first to share"}</p>
              </div>
            ) : (
              <motion.div className="fd2-posts" variants={stagger} initial="hidden" animate="visible">
                {posts.map(function(p) {
                  return (
                    <PostCard
                      key={p.id}
                      post={p}
                      userId={userId}
                      onLike={likePost}
                      onRepost={repostPost}
                      onBookmark={bookmarkPost}
                      isBookmarked={bookmarkedIds.has(p.id)}
                      onReport={reportPost}
                      onReply={replyToPost}
                      onDelete={deletePost}
                      onView={recordView}
                      navigate={navigate}
                    />
                  );
                })}
              </motion.div>
            )}
            {hasMore && <div ref={sentinelRef} className="fd2-sentinel" />}
            {loading && posts.length > 0 && <div className="fd2-loading-more"><div className="fd2-spinner" /></div>}
          </div>
        </div>
        <RightPanel suggestedUsers={suggestedUsers} trendingCommunities={trendingCommunities} leaderboard={leaderboard} />
      </div>
      <AnimatePresence>
        {showAntiScroll && <AntiScrollModal onDismiss={dismissAntiScroll} onFocus={function() { navigate("/focus"); }} />}
      </AnimatePresence>
    </DashboardLayout>
  );
}
