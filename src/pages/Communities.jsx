/**
 * FUTORA — Communities 2.0 Discovery Page
 *
 * Features:
 *  - Browse / My Communities tabs
 *  - Search + sort (Most Members / Most Active / Newest)
 *  - Premium cards with banner, avatar, description, category, member count, active indicator, preview posts
 *  - Infinite scroll
 *  - Create modal with banner/avatar upload + tags
 *  - Empty state
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useCommunityList } from "../hooks/useCommunities";
import { useFeedIntel } from "../hooks/useFeedIntel";
import "./Communities.css";

const CATEGORIES = [
  "Productivity",
  "Fitness",
  "Learning",
  "Mindset",
  "Career",
  "Creative",
  "Health",
  "Finance",
  "Social",
  "Other",
];

/* ═══════════════════════════════════════════════════
   CommunityCard
   ═══════════════════════════════════════════════════ */
function CommunityCard({ community, isMember, previews, onJoin, onLeave, onClick }) {
  const initial = (community.name || "C")[0].toUpperCase();
  const recentEnough =
    previews && previews.length > 0 &&
    Date.now() - new Date(previews[0].created_at).getTime() < 3600000;

  const handleAction = (e) => {
    e.stopPropagation();
    isMember ? onLeave(community.id) : onJoin(community.id);
  };

  return (
    <div className="cm-card" onClick={() => onClick(community)}>
      {/* Banner */}
      <div
        className="cm-card-banner"
        style={community.banner_url ? { backgroundImage: `url(${community.banner_url})` } : undefined}
      >
        {community.banner_url && (
          <img src={community.banner_url} alt="" className="cm-card-banner-img" loading="lazy" />
        )}
      </div>

      {/* Body */}
      <div className="cm-card-body">
        <div className="cm-card-avatar">
          {community.icon_url ? <img src={community.icon_url} alt="" /> : initial}
        </div>

        <div className="cm-card-header">
          <span className="cm-card-name">{community.name}</span>
          {recentEnough && <span className="cm-card-active-dot" title="Active now" />}
        </div>

        {community.description && (
          <p className="cm-card-desc">{community.description}</p>
        )}

        <div className="cm-card-meta">
          {community.category && <span className="cm-card-cat">{community.category}</span>}
          {community.is_private && <span className="cm-private-tag">Private</span>}
          <span className="cm-card-members">{community.members_count || 0} members</span>
        </div>

        {/* Preview posts */}
        {previews && previews.length > 0 && (
          <div className="cm-card-previews">
            {previews.map((p) => (
              <span key={p.id} className="cm-card-preview">
                {p.content}
              </span>
            ))}
          </div>
        )}

        <div className="cm-card-footer">
          <button
            className={isMember ? "cm-btn-joined" : "cm-btn-join"}
            onClick={handleAction}
          >
            {isMember ? "Joined" : "Join"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CreateCommunityModal
   ═══════════════════════════════════════════════════ */
function CreateCommunityModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [rules, setRules] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [bannerFile, setBannerFile] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const result = await onCreate({
      name,
      description,
      category,
      rules,
      isPrivate,
      bannerFile,
      avatarFile,
      tags,
    });
    setSaving(false);
    if (result) onClose();
  };

  return (
    <div className="cm-modal-overlay" onClick={onClose}>
      <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="cm-modal-title">Create community</h2>

        <div className="cm-field">
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="Community name"
            autoFocus
          />
        </div>

        <div className="cm-field">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 300))}
            placeholder="What is this community about?"
            rows={3}
          />
        </div>

        <div className="cm-field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="cm-upload-row">
          <div className="cm-upload-box">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
            />
            <span className="cm-upload-label">Banner image</span>
            {bannerFile && <span className="cm-upload-name">{bannerFile.name}</span>}
          </div>
          <div className="cm-upload-box">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
            />
            <span className="cm-upload-label">Avatar</span>
            {avatarFile && <span className="cm-upload-name">{avatarFile.name}</span>}
          </div>
        </div>

        <div className="cm-field">
          <label>Rules (optional)</label>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value.slice(0, 2000))}
            placeholder="Community rules and guidelines"
            rows={3}
          />
        </div>

        <div className="cm-field">
          <label>Tags (comma separated)</label>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="focus, accountability, growth"
          />
        </div>

        <label className="cm-toggle-row" onClick={() => setIsPrivate(!isPrivate)}>
          <span>Private community</span>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={() => setIsPrivate(!isPrivate)}
          />
        </label>

        <div className="cm-modal-actions">
          <button className="cm-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="cm-btn-create"
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Shared Right Panel — matches Feed layout
   ═══════════════════════════════════════════════════ */
function CommunitiesRightPanel({ trendingCommunities, leaderboard }) {
  const navigate = useNavigate();
  return (
    <aside className="feed-right">
      <div className="feed-panel-card">
        <h3 className="feed-panel-title">Trending Communities</h3>
        {trendingCommunities.length === 0 && <span className="feed-panel-empty">No communities yet</span>}
        {trendingCommunities.slice(0, 4).map((c) => (
          <div key={c.id} className="feed-trend-item" onClick={() => navigate("/communities/" + (c.slug || c.id))}>
            <span className="feed-trend-name">{c.name}</span>
            <span className="feed-trend-count">{c.members_count || 0} members</span>
          </div>
        ))}
      </div>

      <div className="feed-panel-card">
        <h3 className="feed-panel-title">Discipline Leaderboard</h3>
        {leaderboard.length === 0 && <span className="feed-panel-empty">No data yet</span>}
        {leaderboard.map((u, i) => (
          <div key={u.id} className="feed-lb-row" onClick={() => navigate("/profile/" + u.id)}>
            <span className="feed-lb-rank">#{i + 1}</span>
            <span className="feed-lb-name">{u.identity || "User"}</span>
            <span className="feed-lb-xp">{u.xp || 0} XP</span>
          </div>
        ))}
      </div>

      <div className="feed-panel-card feed-focus-cta">
        <h4>Ready to focus?</h4>
        <p>Stop scrolling. Start building.</p>
        <button className="feed-cta-btn" onClick={() => navigate("/focus")}>Start Focus</button>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════
   Communities Page
   ═══════════════════════════════════════════════════ */
export default function Communities() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    communities,
    myCommunities,
    recentPosts,
    loading,
    hasMore,
    createCommunity,
    joinCommunity,
    leaveCommunity,
    search: searchFn,
    loadMore,
  } = useCommunityList(user?.id);

  const { trendingCommunities, leaderboard } = useFeedIntel(user?.id, []);

  const [view, setView] = useState("browse");
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState("members");
  const [showCreate, setShowCreate] = useState(false);
  const debounceRef = useRef(null);

  // Derived sets
  const myIds = new Set(myCommunities.map((c) => c.id));

  // Active list
  const displayed = view === "mine" ? myCommunities : communities;

  // Search debounce
  const handleSearch = useCallback(
    (value) => {
      setSearchTerm(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        searchFn(value, sort);
      }, 350);
    },
    [searchFn, sort]
  );

  const handleSortChange = useCallback(
    (e) => {
      const next = e.target.value;
      setSort(next);
      searchFn(searchTerm, next);
    },
    [searchFn, searchTerm]
  );

  const handleCardClick = useCallback(
    (community) => {
      navigate(`/communities/${community.slug || community.id}`);
    },
    [navigate]
  );

  // Observer for infinite scroll
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (view === "mine" || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          loadMore(sort, searchTerm);
        }
      },
      { rootMargin: "200px" }
    );
    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [view, hasMore, loading, loadMore, sort, searchTerm]);

  return (
    <DashboardLayout pageTitle="COMMUNITIES">
      <div className="cm-page">
        <div className="cm-main">
          {/* Header */}
          <div className="cm-header">
            <div className="cm-header-left">
              <h1 className="cm-title">Communities</h1>
              <p className="cm-subtitle">Focused groups building together</p>
            </div>
            <button className="cm-create-btn" onClick={() => setShowCreate(true)}>
              Create community
            </button>
          </div>

          {/* Controls */}
          <div className="cm-controls">
            <div className="cm-view-tabs">
              <button
                className={`cm-vtab ${view === "browse" ? "active" : ""}`}
                onClick={() => setView("browse")}
              >
                Browse
              </button>
              <button
                className={`cm-vtab ${view === "mine" ? "active" : ""}`}
                onClick={() => setView("mine")}
              >
                My Communities
              </button>
            </div>

            <input
              className="cm-search"
              type="text"
              placeholder="Search communities..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />

            {view === "browse" && (
              <select className="cm-sort-select" value={sort} onChange={handleSortChange}>
                <option value="members">Most Members</option>
                <option value="active">Most Active</option>
                <option value="newest">Newest</option>
              </select>
            )}
          </div>

          {/* Grid */}
          <div className="cm-grid">
            {loading && displayed.length === 0 && (
              <div className="cm-loading">
                <div className="cm-spinner" />
                <span>Loading communities...</span>
              </div>
            )}

            {!loading && displayed.length === 0 && (
              <div className="cm-empty">
                <div className="cm-empty-divider" />
                <h3>{view === "mine" ? "No communities yet" : "Build the first focused group"}</h3>
                <p>
                  {view === "mine"
                    ? "Join or create a community to get started."
                    : "Start a community and bring people together."}
                </p>
                <button className="cm-empty-cta" onClick={() => setShowCreate(true)}>
                  Create community
                </button>
              </div>
            )}

            {displayed.map((c) => (
              <CommunityCard
                key={c.id}
                community={c}
                isMember={myIds.has(c.id)}
                previews={recentPosts[c.id]}
                onJoin={joinCommunity}
                onLeave={leaveCommunity}
                onClick={handleCardClick}
              />
            ))}

            {/* Infinite scroll sentinel */}
            {view === "browse" && hasMore && <div ref={sentinelRef} className="cm-load-more" />}
          </div>
        </div>

        <CommunitiesRightPanel trendingCommunities={trendingCommunities} leaderboard={leaderboard} />
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateCommunityModal
          onClose={() => setShowCreate(false)}
          onCreate={createCommunity}
        />
      )}
    </DashboardLayout>
  );
}
