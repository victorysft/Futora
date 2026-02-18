/**
 * FUTORA — Community Detail 2.0
 *
 * Two-column layout inside DashboardLayout:
 *   Left/center: Community content (banner, tabs, feed/members/about/rules/leaderboard)
 *   Right: Insights panel (sticky)
 *
 * Features:
 *  - Banner + hero header with join/leave
 *  - Tabs: Feed, Members, About, Rules, Leaderboard
 *  - Feed with compose box, sort (New/Top/Trending), likes, comments
 *  - Members with role badges, sort, moderation controls
 *  - About: description, details, tags
 *  - Rules: community guidelines
 *  - Leaderboard: top 10 by XP
 *  - Insights panel: members, posts today, top contributor, join CTA
 *  - Realtime post + member updates
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useCommunityDetail, getCommunityLevel } from "../hooks/useCommunities";
import "./CommunityDetail.css";

/* ── Helpers ── */
function timeAgo(date) {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

const ROLE_STYLES = {
  owner: { background: "rgba(234,179,8,0.12)", color: "#EAB308", borderColor: "rgba(234,179,8,0.2)" },
  admin: { background: "rgba(239,68,68,0.1)", color: "#EF4444", borderColor: "rgba(239,68,68,0.2)" },
  moderator: { background: "rgba(59,130,246,0.1)", color: "#3B82F6", borderColor: "rgba(59,130,246,0.2)" },
  member: { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.06)" },
};

const TABS = ["Feed", "Members", "About", "Rules", "Leaderboard"];
const FEED_SORTS = ["new", "top", "trending"];

/* ═══════════════════════════════════════════════════
   PostCard — Feed post with likes, comments
   ═══════════════════════════════════════════════════ */
function PostCard({ post, liked, myRole, userId, onLike, onDelete, onReport, onToggleComments, showComments, comments, onAddComment, onFetchComments }) {
  const profile = post.profiles || {};
  const initial = (profile.identity || "U")[0].toUpperCase();
  const canModerate = myRole === "owner" || myRole === "admin" || myRole === "moderator";
  const isOwn = post.user_id === userId;
  const [commentText, setCommentText] = useState("");

  const handleToggle = () => {
    if (!showComments) onFetchComments(post.id);
    onToggleComments(post.id);
  };

  const handleComment = () => {
    if (!commentText.trim()) return;
    onAddComment(post.id, commentText);
    setCommentText("");
  };

  return (
    <div className="cd-post">
      <div className="cd-post-header">
        <div className="cd-post-avatar">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initial}
        </div>
        <div className="cd-post-meta">
          <span className="cd-post-author">
            {profile.identity || "User"}
            <span className="cd-post-level">Lv.{profile.level || 1}</span>
          </span>
          <span className="cd-post-time">{timeAgo(post.created_at)}</span>
        </div>
        <div className="cd-post-actions-top">
          {!isOwn && (
            <button className="cd-post-action-btn" onClick={() => onReport(post.id)} title="Report">
              Report
            </button>
          )}
          {(isOwn || canModerate) && (
            <button className="cd-post-action-btn danger" onClick={() => onDelete(post.id)} title="Delete">
              Delete
            </button>
          )}
        </div>
      </div>

      <p className="cd-post-content">{post.content}</p>

      <div className="cd-post-bar">
        <button
          className={`cd-bar-btn ${liked ? "liked" : ""}`}
          onClick={() => onLike(post.id)}
        >
          <span className="cd-bar-icon">{liked ? "\u2764" : "\u2661"}</span>
          {post.like_count || 0}
        </button>
        <button className="cd-bar-btn" onClick={handleToggle}>
          <span className="cd-bar-icon">{"\u2709"}</span>
          {post.comment_count || 0}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="cd-comments">
          {(comments || []).map((c) => {
            const cp = c.profiles || {};
            return (
              <div key={c.id} className="cd-comment">
                <div className="cd-comment-avatar">
                  {(cp.identity || "U")[0].toUpperCase()}
                </div>
                <div className="cd-comment-body">
                  <span className="cd-comment-author">{cp.identity || "User"}</span>
                  <p className="cd-comment-text">{c.content}</p>
                  <span className="cd-comment-time">{timeAgo(c.created_at)}</span>
                </div>
              </div>
            );
          })}
          <div className="cd-comment-input-row">
            <input
              className="cd-comment-input"
              placeholder="Write a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => e.key === "Enter" && handleComment()}
            />
            <button className="cd-comment-submit" onClick={handleComment}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MemberRow
   ═══════════════════════════════════════════════════ */
function MemberRow({ member, myRole, userId, onUpdateRole, onBan }) {
  const profile = member.profiles || {};
  const initial = (profile.identity || "U")[0].toUpperCase();
  const style = ROLE_STYLES[member.role] || ROLE_STYLES.member;
  const canManage = (myRole === "owner" || myRole === "admin") && member.user_id !== userId;
  const level = getCommunityLevel(member.xp || 0);

  return (
    <div className="cd-member-row">
      <div className="cd-member-avatar">
        {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initial}
      </div>
      <div className="cd-member-info">
        <span className="cd-member-name">{profile.identity || "User"}</span>
        <div className="cd-member-sub">
          <span>{level}</span>
          <span>Streak {profile.streak || 0}</span>
        </div>
      </div>
      <span className="cd-member-role-badge" style={style}>{member.role}</span>
      <span className="cd-member-xp-val">{member.xp || 0} XP</span>
      {canManage && (
        <div className="cd-member-actions">
          <select
            className="cd-role-select"
            value={member.role}
            onChange={(e) => onUpdateRole(member.user_id, e.target.value)}
          >
            <option value="member">Member</option>
            <option value="moderator">Moderator</option>
            {myRole === "owner" && <option value="admin">Admin</option>}
          </select>
          <button className="cd-ban-btn" onClick={() => onBan(member.user_id, "Banned by moderator")}>
            Ban
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   InsightsPanel (right column)
   ═══════════════════════════════════════════════════ */
function InsightsPanel({ community, members, insights, myRole, onJoin }) {
  return (
    <aside className="cd-insights">
      {/* Stats */}
      <div className="cd-insight-card">
        <div className="cd-insight-title">Community Stats</div>
        <div className="cd-insight-stat">
          <span className="cd-insight-label">Members</span>
          <span className="cd-insight-value">{community?.members_count || members.length}</span>
        </div>
        <div className="cd-insight-stat">
          <span className="cd-insight-label">Total Posts</span>
          <span className="cd-insight-value">{community?.posts_count || 0}</span>
        </div>
        <div className="cd-insight-stat">
          <span className="cd-insight-label">Posts Today</span>
          <span className="cd-insight-value purple">{insights.postsToday}</span>
        </div>
        <div className="cd-insight-stat">
          <span className="cd-insight-label">Category</span>
          <span className="cd-insight-value">{community?.category || "General"}</span>
        </div>
      </div>

      {/* Top contributor */}
      {insights.topContributor && (
        <div className="cd-insight-card">
          <div className="cd-insight-title">Top Contributor</div>
          <div className="cd-insight-stat">
            <span className="cd-insight-label">{insights.topContributor.name}</span>
            <span className="cd-insight-value purple">{insights.topContributor.xp} XP</span>
          </div>
        </div>
      )}

      {/* Join CTA */}
      {!myRole && (
        <div className="cd-insight-card">
          <div className="cd-insight-title">Join this community</div>
          <p style={{ fontFamily: "var(--d-font, 'Inter', sans-serif)", fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Be part of a focused group building together.
          </p>
          <button className="cd-insight-join" onClick={onJoin}>Join Community</button>
        </div>
      )}
    </aside>
  );
}

/* ═══════════════════════════════════════════════════
   CommunityDetail — Main Page
   ═══════════════════════════════════════════════════ */
export default function CommunityDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [communityId, setCommunityId] = useState(null);
  const [resolving, setResolving] = useState(true);

  // Resolve slug → ID
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      setResolving(true);
      // UUID check
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(slug)) {
        setCommunityId(slug);
        setResolving(false);
        return;
      }
      const { data } = await supabase.from("communities").select("id").eq("slug", slug).single();
      if (!cancelled && data) setCommunityId(data.id);
      if (!cancelled) setResolving(false);
    }
    resolve();
    return () => { cancelled = true; };
  }, [slug]);

  const {
    community,
    members,
    posts,
    myRole,
    myLikes,
    comments,
    loading,
    insights,
    tags,
    createPost,
    likePost,
    fetchComments,
    addComment,
    deletePost,
    reportPost,
    updateRole,
    banUser,
    joinCommunity,
    leaveCommunity,
    sortPosts,
  } = useCommunityDetail(communityId, user?.id);

  const [tab, setTab] = useState("Feed");
  const [feedSort, setFeedSort] = useState("new");
  const [composeText, setComposeText] = useState("");
  const [posting, setPosting] = useState(false);
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [memberSort, setMemberSort] = useState("xp");

  // Handle feed sort change
  const handleFeedSort = useCallback(
    (s) => {
      setFeedSort(s);
      sortPosts(s);
    },
    [sortPosts]
  );

  // Compose submit
  const handlePost = async () => {
    if (!composeText.trim() || posting) return;
    setPosting(true);
    await createPost(composeText);
    setComposeText("");
    setPosting(false);
  };

  // Comment toggle
  const toggleComments = useCallback((postId) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  // Member sorting
  const sortedMembers = [...members].sort((a, b) => {
    if (memberSort === "xp") return (b.xp || 0) - (a.xp || 0);
    if (memberSort === "newest") return new Date(b.joined_at || b.created_at) - new Date(a.joined_at || a.created_at);
    if (memberSort === "name") return (a.profiles?.identity || "").localeCompare(b.profiles?.identity || "");
    return 0;
  });

  // Loading states
  if (resolving || (loading && !community)) {
    return (
      <DashboardLayout pageTitle="COMMUNITY">
        <div className="cd-loading">
          <div className="cd-spinner" />
          <span>Loading community...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (!community) {
    return (
      <DashboardLayout pageTitle="COMMUNITY">
        <div className="cd-empty">
          <h3>Community not found</h3>
          <p>This community may have been removed or the link is incorrect.</p>
          <button className="cd-empty-btn" onClick={() => navigate("/communities")}>
            Back to communities
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const heroInitial = (community.name || "C")[0].toUpperCase();
  const canPost = !!myRole;

  return (
    <DashboardLayout pageTitle={community.name?.toUpperCase() || "COMMUNITY"}>
      <div className="cd-page">
        <div className="cd-content">
        {/* Hero */}
        <div className="cd-hero">
          <div
            className="cd-banner"
            style={community.banner_url ? { backgroundImage: `url(${community.banner_url})` } : undefined}
          >
            {community.banner_url && (
              <img src={community.banner_url} alt="" className="cd-banner-img" loading="lazy" />
            )}
            <button className="cd-back-btn" onClick={() => navigate("/communities")}>
              Back
            </button>
          </div>

          <div className="cd-hero-body">
            <div className="cd-hero-avatar">
              {community.icon_url ? <img src={community.icon_url} alt="" /> : heroInitial}
            </div>

            <div className="cd-hero-info">
              <h1 className="cd-name">{community.name}</h1>
              {community.description && <p className="cd-description">{community.description}</p>}
              <div className="cd-hero-meta">
                {community.category && <span className="cd-meta-cat">{community.category}</span>}
                {community.is_private && <span className="cd-private-tag">Private</span>}
                <span className="cd-meta-item">{community.members_count || 0} members</span>
                <span className="cd-meta-item">{community.posts_count || 0} posts</span>
                {myRole && (
                  <span className="cd-role-tag" style={ROLE_STYLES[myRole]}>
                    {myRole}
                  </span>
                )}
              </div>
            </div>

            <div className="cd-hero-actions">
              {myRole ? (
                <button className="cd-leave-btn" onClick={leaveCommunity}>Leave</button>
              ) : (
                <button className="cd-join-btn" onClick={joinCommunity}>Join</button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="cd-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={`cd-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ══ Tab Content ══ */}

        {/* FEED */}
        {tab === "Feed" && (
          <>
            {canPost && (
              <div className="cd-compose">
                <textarea
                  className="cd-compose-input"
                  rows={3}
                  placeholder="Share something with the community..."
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value.slice(0, 2000))}
                />
                <div className="cd-compose-footer">
                  <span className="cd-char-count">{composeText.length}/2000</span>
                  <button
                    className="cd-post-btn"
                    onClick={handlePost}
                    disabled={!composeText.trim() || posting}
                  >
                    {posting ? "Posting..." : "Post"}
                  </button>
                </div>
              </div>
            )}

            <div className="cd-feed-sort">
              {FEED_SORTS.map((s) => (
                <button
                  key={s}
                  className={`cd-sort-btn ${feedSort === s ? "active" : ""}`}
                  onClick={() => handleFeedSort(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {posts.length === 0 && !loading && (
              <div className="cd-empty">
                <h3>No posts yet</h3>
                <p>{canPost ? "Be the first to share something." : "Join this community to start posting."}</p>
              </div>
            )}

            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                liked={myLikes.has(p.id)}
                myRole={myRole}
                userId={user?.id}
                onLike={likePost}
                onDelete={deletePost}
                onReport={reportPost}
                onToggleComments={toggleComments}
                showComments={expandedComments.has(p.id)}
                comments={comments[p.id]}
                onAddComment={addComment}
                onFetchComments={fetchComments}
              />
            ))}
          </>
        )}

        {/* MEMBERS */}
        {tab === "Members" && (
          <>
            <div className="cd-members-header">
              {["xp", "newest", "name"].map((s) => (
                <button
                  key={s}
                  className={`cd-members-sort ${memberSort === s ? "active" : ""}`}
                  onClick={() => setMemberSort(s)}
                >
                  {s === "xp" ? "Top XP" : s === "newest" ? "Newest" : "Name"}
                </button>
              ))}
            </div>
            {sortedMembers.map((m) => (
              <MemberRow
                key={m.user_id}
                member={m}
                myRole={myRole}
                userId={user?.id}
                onUpdateRole={updateRole}
                onBan={banUser}
              />
            ))}
            {sortedMembers.length === 0 && (
              <div className="cd-empty">
                <h3>No members yet</h3>
                <p>Be the first to join this community.</p>
              </div>
            )}
          </>
        )}

        {/* ABOUT */}
        {tab === "About" && (
          <div className="cd-about">
            <div className="cd-about-section">
              <div className="cd-section-title">Description</div>
              <p className="cd-about-text">{community.description || "No description provided."}</p>
            </div>

            <div className="cd-about-section">
              <div className="cd-section-title">Details</div>
              <div className="cd-about-details">
                <div className="cd-about-detail">
                  <span className="cd-about-label">Category</span>
                  <span className="cd-about-value">{community.category || "General"}</span>
                </div>
                <div className="cd-about-detail">
                  <span className="cd-about-label">Visibility</span>
                  <span className="cd-about-value">{community.is_private ? "Private" : "Public"}</span>
                </div>
                <div className="cd-about-detail">
                  <span className="cd-about-label">Created</span>
                  <span className="cd-about-value">
                    {new Date(community.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <div className="cd-about-detail">
                  <span className="cd-about-label">Members</span>
                  <span className="cd-about-value">{community.members_count || 0}</span>
                </div>
              </div>
            </div>

            {tags.length > 0 && (
              <div className="cd-about-section">
                <div className="cd-section-title">Tags</div>
                <div className="cd-tags">
                  {tags.map((t) => (
                    <span key={t} className="cd-tag">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* RULES */}
        {tab === "Rules" && (
          <div className="cd-rules-panel">
            <div className="cd-section-title">Community Rules</div>
            <p className="cd-rules-text">
              {community.rules || "No specific rules have been set for this community."}
            </p>
          </div>
        )}

        {/* LEADERBOARD */}
        {tab === "Leaderboard" && (
          <div className="cd-leaderboard">
            {members.slice(0, 10).map((m, i) => {
              const profile = m.profiles || {};
              const initial = (profile.identity || "U")[0].toUpperCase();
              const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
              return (
                <div key={m.user_id} className="cd-lb-row">
                  <span className={`cd-lb-rank ${rankClass}`}>#{i + 1}</span>
                  <div className="cd-lb-avatar">{initial}</div>
                  <div className="cd-lb-info">
                    <span className="cd-lb-name">{profile.identity || "User"}</span>
                    <span className="cd-lb-level">{getCommunityLevel(m.xp || 0)}</span>
                  </div>
                  <span className="cd-lb-xp">{m.xp || 0} XP</span>
                </div>
              );
            })}
            {members.length === 0 && (
              <div className="cd-empty">
                <h3>No activity yet</h3>
                <p>Start contributing to appear on the leaderboard.</p>
              </div>
            )}
          </div>
        )}
      </div>

        <InsightsPanel
          community={community}
          members={members}
          insights={insights}
          myRole={myRole}
          onJoin={joinCommunity}
        />
      </div>
    </DashboardLayout>
  );
}
