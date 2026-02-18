import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useCommunityDetail, getCommunityLevel } from "../hooks/useCommunities";
import { supabase } from "../supabaseClient";
import "./Communities.css";

/* ═══════════════════════════════════════════
   FUTORA · Community Detail — Group Arena
   ═══════════════════════════════════════════ */

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const POST_TYPE_MAP = {
  progress: { label: "Progress", color: "#10B981", icon: "P" },
  reflection: { label: "Reflection", color: "#8B5CF6", icon: "R" },
  mission: { label: "Mission", color: "#3B82F6", icon: "M" },
};

function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ROLE_BADGE = {
  owner: { label: "Owner", color: "#EAB308" },
  admin: { label: "Admin", color: "#EF4444" },
  moderator: { label: "Mod", color: "#3B82F6" },
  member: { label: "", color: "" },
};

/* ══════════════════════════════════════════════
   COMMUNITY HEADER — Full-width Banner
   ══════════════════════════════════════════════ */
function CommunityHeader({ community, myRole, memberCount, onBack }) {
  return (
    <motion.div className="cd-hero" variants={fadeUp}>
      {/* Full-width banner */}
      <div
        className="cd-banner"
        style={community.banner_url ? { backgroundImage: `url(${community.banner_url})` } : {}}
      >
        <button className="cd-back-btn" onClick={onBack}>← Back</button>
      </div>

      <div className="cd-hero-body">
        <div className="cd-hero-avatar">
          {community.avatar_url ? (
            <img src={community.avatar_url} alt="" className="cd-hero-avatar-img" />
          ) : (
            <span>{(community.name || "C")[0].toUpperCase()}</span>
          )}
        </div>
        <div className="cd-hero-info">
          <h1 className="cd-name">{community.name}</h1>
          {community.description && (
            <p className="cd-description">{community.description}</p>
          )}
          <div className="cd-hero-stats">
            <span className="cd-stat">{memberCount} members</span>
            {community.category && <span className="cd-stat">{community.category}</span>}
            {myRole && (
              <span
                className="cd-role-tag"
                style={{
                  background: (ROLE_BADGE[myRole]?.color || "#8B5CF6") + "20",
                  color: ROLE_BADGE[myRole]?.color || "#8B5CF6",
                }}
              >
                {ROLE_BADGE[myRole]?.label || myRole}
              </span>
            )}
            {community.is_private && <span className="cd-private-tag">Private</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════
   COMPOSE (community)
   ══════════════════════════════════════════════ */
function CommunityCompose({ onPost }) {
  const [type, setType] = useState("reflection");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);
    await onPost(type, content);
    setContent("");
    setPosting(false);
  };

  return (
    <motion.div className="cd-compose" variants={fadeUp}>
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
        className="fd-compose-input"
        placeholder="Post in this community…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={600}
        rows={2}
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

/* ══════════════════════════════════════════════
   COMMUNITY POST CARD
   ══════════════════════════════════════════════ */
function CommunityPostCard({ post, myRole, userId, onDelete }) {
  const author = post.profiles || {};
  const typeCfg = POST_TYPE_MAP[post.type] || POST_TYPE_MAP.reflection;
  const canDelete = post.user_id === userId || ["owner", "admin", "moderator"].includes(myRole);

  return (
    <motion.div className="cd-post" variants={fadeUp}>
      <div className="fd-post-header">
        <div className="fd-post-avatar">
          {(author.identity || "?")[0].toUpperCase()}
        </div>
        <div className="fd-post-meta">
          <div className="fd-post-author-row">
            <span className="fd-post-author">{author.identity || "User"}</span>
            {author.verified && (
              <svg className="fd-verified" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 0L9.8 2.4L12.8 2L12.4 5L15 6.8L13.2 9.2L14 12L11.2 12.4L9.8 15L8 13L6.2 15L4.8 12.4L2 12L2.8 9.2L1 6.8L3.6 5L3.2 2L6.2 2.4L8 0Z" fill="#3B82F6" />
                <path d="M6.5 8.5L7.5 9.5L10 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className="fd-post-level">Lv.{author.level || 0}</span>
          </div>
          <div className="fd-post-time-row">
            <span className="fd-post-type-tag" style={{ background: typeCfg.color + "18", color: typeCfg.color }}>
              {typeCfg.icon} {typeCfg.label}
            </span>
            <span className="fd-post-time">{timeAgo(post.created_at)}</span>
          </div>
        </div>
        {canDelete && (
          <button className="cd-delete-btn" onClick={() => onDelete(post.id)} title="Delete post">✕</button>
        )}
      </div>
      <p className="fd-post-content">{post.content}</p>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════
   MEMBER CARD
   ══════════════════════════════════════════════ */
function MemberCard({ member, myRole, userId, onRoleChange, onBan }) {
  const profile = member.profiles || {};
  const roleInfo = ROLE_BADGE[member.role] || ROLE_BADGE.member;
  const canManage =
    (myRole === "owner" || myRole === "admin") &&
    member.user_id !== userId &&
    member.role !== "owner";

  return (
    <div className="cd-member">
      <div className="cd-member-avatar">
        {(profile.identity || "?")[0].toUpperCase()}
      </div>
      <div className="cd-member-info">
        <div className="cd-member-name-row">
          <span className="cd-member-name">{profile.identity || "User"}</span>
          {profile.verified && <span className="cd-member-verified">V</span>}
          {roleInfo.label && (
            <span className="cd-member-role" style={{ color: roleInfo.color }}>
              {roleInfo.label}
            </span>
          )}
        </div>
        <span className="cd-member-xp">
          {member.xp || 0} XP · {getCommunityLevel(member.xp || 0)}
        </span>
      </div>
      {canManage && (
        <div className="cd-member-actions">
          <select
            className="cd-role-select"
            value={member.role}
            onChange={(e) => onRoleChange(member.user_id, e.target.value)}
          >
            <option value="member">Member</option>
            <option value="moderator">Moderator</option>
            {myRole === "owner" && <option value="admin">Admin</option>}
          </select>
          <button className="cd-ban-btn" onClick={() => onBan(member.user_id)} title="Ban user">
            Ban
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   RULES PANEL
   ══════════════════════════════════════════════ */
function RulesPanel({ rules }) {
  if (!rules) return null;
  return (
    <motion.div className="cd-rules" variants={fadeUp}>
      <h3 className="cd-section-title">Community Rules</h3>
      <p className="cd-rules-text">{rules}</p>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   COMMUNITY DETAIL PAGE
   ══════════════════════════════════════════════════════════ */
export default function CommunityDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  // Resolve slug → id
  const [communityId, setCommunityId] = useState(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setResolving(true);
      // Try UUID first
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidPattern.test(slug)) {
        setCommunityId(slug);
      } else {
        const { data } = await supabase
          .from("communities")
          .select("id")
          .eq("slug", slug)
          .single();
        setCommunityId(data?.id || null);
      }
      setResolving(false);
    })();
  }, [slug]);

  const {
    community,
    members,
    posts,
    myRole,
    loading,
    createPost,
    deletePost,
    updateRole,
    banUser,
  } = useCommunityDetail(communityId, userId);

  const [activeTab, setActiveTab] = useState("posts");

  if (resolving || loading) {
    return (
      <DashboardLayout>
        <div className="cm-page">
          <div className="cm-loading">
            <div className="cm-spinner" />
            <span>Loading community…</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!community) {
    return (
      <DashboardLayout>
        <div className="cm-page">
          <div className="cm-empty">
            <span className="cm-empty-icon">--</span>
            <h3>Community not found</h3>
            <button className="cm-btn-join" onClick={() => navigate("/communities")}>
              Browse Communities
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="cm-page cd-page">
        <motion.div variants={stagger} initial="hidden" animate="visible">
          {/* Hero */}
          <CommunityHeader
            community={community}
            myRole={myRole}
            memberCount={members.length}
            onBack={() => navigate("/communities")}
          />

          {/* Rules */}
          <RulesPanel rules={community.rules} />

          {/* Tabs */}
          <div className="cd-tabs">
            <button
              className={`cd-tab${activeTab === "posts" ? " active" : ""}`}
              onClick={() => setActiveTab("posts")}
            >
              Posts ({posts.length})
            </button>
            <button
              className={`cd-tab${activeTab === "about" ? " active" : ""}`}
              onClick={() => setActiveTab("about")}
            >
              About
            </button>
            <button
              className={`cd-tab${activeTab === "members" ? " active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              Members ({members.length})
            </button>
            <button
              className={`cd-tab${activeTab === "leaderboard" ? " active" : ""}`}
              onClick={() => setActiveTab("leaderboard")}
            >
              Leaderboard
            </button>
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === "posts" && (
              <motion.div
                key="posts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {myRole && <CommunityCompose onPost={createPost} />}

                <div className="cd-posts-list">
                  {posts.length === 0 ? (
                    <div className="cm-empty compact" style={{ textAlign: "center", padding: "40px 20px" }}>
                      <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>+</div>
                      <h3 style={{ color: "#fff", fontSize: 16, marginBottom: 6 }}>Start the conversation</h3>
                      <p style={{ color: "var(--d-text-muted)", fontSize: 13 }}>Share an update with this community</p>
                    </div>
                  ) : (
                    posts.map((p) => (
                      <CommunityPostCard
                        key={p.id}
                        post={p}
                        myRole={myRole}
                        userId={userId}
                        onDelete={deletePost}
                      />
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "about" && (
              <motion.div
                key="about"
                className="cd-about"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="cd-about-section">
                  <h3 className="cd-section-title">Description</h3>
                  <p className="cd-about-text">{community.description || "No description yet."}</p>
                </div>

                {community.rules && (
                  <div className="cd-about-section">
                    <h3 className="cd-section-title">Community Rules</h3>
                    <p className="cd-about-text">{community.rules}</p>
                  </div>
                )}

                <div className="cd-about-section">
                  <h3 className="cd-section-title">Details</h3>
                  <div className="cd-about-details">
                    {community.category && (
                      <div className="cd-about-detail">
                        <span className="cd-about-label">Category</span>
                        <span className="cd-about-value">{community.category}</span>
                      </div>
                    )}
                    <div className="cd-about-detail">
                      <span className="cd-about-label">Members</span>
                      <span className="cd-about-value">{members.length}</span>
                    </div>
                    <div className="cd-about-detail">
                      <span className="cd-about-label">Posts</span>
                      <span className="cd-about-value">{posts.length}</span>
                    </div>
                    <div className="cd-about-detail">
                      <span className="cd-about-label">Visibility</span>
                      <span className="cd-about-value">{community.is_private ? "Private" : "Public"}</span>
                    </div>
                    <div className="cd-about-detail">
                      <span className="cd-about-label">Created</span>
                      <span className="cd-about-value">
                        {new Date(community.created_at).toLocaleDateString("en-US", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "members" && (
              <motion.div
                key="members"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Members Table Header */}
                <div className="cd-members-table-header">
                  <span className="cd-mtcol cd-mtcol-name">Member</span>
                  <span className="cd-mtcol cd-mtcol-role">Role</span>
                  <span className="cd-mtcol cd-mtcol-xp">XP</span>
                  <span className="cd-mtcol cd-mtcol-level">Level</span>
                  {(myRole === "owner" || myRole === "admin") && (
                    <span className="cd-mtcol cd-mtcol-actions">Actions</span>
                  )}
                </div>

                <div className="cd-members-list">
                  {members.map((m) => {
                    const profile = m.profiles || {};
                    const roleInfo = ROLE_BADGE[m.role] || ROLE_BADGE.member;
                    const canManage =
                      (myRole === "owner" || myRole === "admin") &&
                      m.user_id !== userId &&
                      m.role !== "owner";
                    const memberLevel = getCommunityLevel(m.xp || 0);

                    return (
                      <div key={m.user_id} className="cd-member-row">
                        <div className="cd-mtcol cd-mtcol-name">
                          <div className="cd-member-avatar">
                            {(profile.identity || "?")[0].toUpperCase()}
                          </div>
                          <div className="cd-member-info">
                            <span className="cd-member-name">
                              {profile.identity || "User"}
                              {profile.verified && <span className="cd-member-verified"> V</span>}
                            </span>
                          </div>
                        </div>
                        <div className="cd-mtcol cd-mtcol-role">
                          {roleInfo.label ? (
                            <span className="cd-member-role-badge" style={{ color: roleInfo.color, borderColor: roleInfo.color + "40" }}>
                              {roleInfo.label}
                            </span>
                          ) : (
                            <span className="cd-member-role-badge cd-member-role-default">Member</span>
                          )}
                        </div>
                        <div className="cd-mtcol cd-mtcol-xp">
                          <span className="cd-member-xp-value">{m.xp || 0}</span>
                        </div>
                        <div className="cd-mtcol cd-mtcol-level">
                          <span className="cd-member-level-tag">{memberLevel}</span>
                        </div>
                        {(myRole === "owner" || myRole === "admin") && (
                          <div className="cd-mtcol cd-mtcol-actions">
                            {canManage ? (
                              <>
                                <select
                                  className="cd-role-select"
                                  value={m.role}
                                  onChange={(e) => updateRole(m.user_id, e.target.value)}
                                >
                                  <option value="member">Member</option>
                                  <option value="moderator">Mod</option>
                                  {myRole === "owner" && <option value="admin">Admin</option>}
                                </select>
                                <button
                                  className="cd-ban-btn"
                                  onClick={() => banUser(m.user_id, "Banned by moderator")}
                                  title="Ban user"
                                >
                                  Ban
                                </button>
                              </>
                            ) : (
                              <span className="cd-no-action">—</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeTab === "leaderboard" && (
              <motion.div
                key="leaderboard"
                className="cd-leaderboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {members
                  .sort((a, b) => (b.xp || 0) - (a.xp || 0))
                  .map((m, i) => {
                    const profile = m.profiles || {};
                    return (
                      <div key={m.user_id} className="cd-lb-row">
                        <span className={`cd-lb-rank${i < 3 ? " top" : ""}`}>
                          {`#${i + 1}`}
                        </span>
                        <div className="cd-lb-avatar">
                          {(profile.identity || "?")[0].toUpperCase()}
                        </div>
                        <div className="cd-lb-info">
                          <span className="cd-lb-name">{profile.identity || "User"}</span>
                          <span className="cd-lb-level">{getCommunityLevel(m.xp || 0)}</span>
                        </div>
                        <span className="cd-lb-xp">{m.xp || 0} XP</span>
                      </div>
                    );
                  })}
                {members.length === 0 && (
                  <div className="cm-empty compact" style={{ textAlign: "center", padding: "40px 20px" }}>
                    <h3 style={{ color: "#fff", fontSize: 16 }}>Be the first to join</h3>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
