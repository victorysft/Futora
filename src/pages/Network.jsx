import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { useFollowing } from "../hooks/useFollowing";
import { supabase } from "../supabaseClient";
import DashboardLayout from "../components/DashboardLayout";
import StreakBadge from "../components/StreakBadge";
import "./Dashboard.css";
import "./Network.css";

/* ── Animation ── */
const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

function formatTime(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function feedDescription(type, meta) {
  const m = typeof meta === "string" ? JSON.parse(meta) : meta || {};
  switch (type) {
    case "checkin":
      return `checked in · streak ${m.streak || 0}`;
    case "levelup":
      return `leveled up to Lv. ${m.to_level || "?"}`;
    case "login":
      return "came online";
    case "follow":
      return "started following someone";
    case "streak_milestone":
      return `hit a ${m.streak || "?"}-day streak!`;
    default:
      return "was active";
  }
}

const TABS = ["Discover", "Following", "Followers", "Requests"];

export default function Network() {
  const { user } = useAuth();
  const {
    following,
    followers,
    pendingRequests,
    friendsOnline,
    followingFeed,
    getFollowState,
    isFollowing, // Backwards compatibility
    follow,
    unfollow,
    acceptFollowRequest,
    declineFollowRequest,
    fetchFollowStates,
    loading: followLoading,
  } = useFollowing(user?.id);

  const [activeTab, setActiveTab] = useState("Discover");
  const [searchQuery, setSearchQuery] = useState("");
  const [allBuilders, setAllBuilders] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Fetch all builders for discover ──
  const fetchBuilders = useCallback(async () => {
    try {
      setSearchLoading(true);
      let query = supabase
        .from("profiles")
        .select("id, identity, becoming, xp, level, streak, focus, location, is_private")
        .order("xp", { ascending: false })
        .limit(50);

      if (searchQuery.trim()) {
        query = query.or(
          `identity.ilike.%${searchQuery}%,becoming.ilike.%${searchQuery}%,focus.ilike.%${searchQuery}%`
        );
      }

      const { data } = await query;
      const builders = (data || []).filter((p) => p.id !== user?.id);
      setAllBuilders(builders);
      
      // Fetch follow states for all discovered builders
      if (builders.length > 0 && fetchFollowStates) {
        const ids = builders.map(b => b.id);
        fetchFollowStates(ids);
      }
    } catch (err) {
      console.error("[Network] fetch error:", err);
    } finally {
      setSearchLoading(false);
    }
  }, [user?.id, searchQuery, fetchFollowStates]);

  useEffect(() => {
    fetchBuilders();
  }, [fetchBuilders]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(fetchBuilders, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Friends online ──
  const [onlineFriends, setOnlineFriends] = useState([]);
  useEffect(() => {
    async function fetchOnlineFriends() {
      if (!following || following.length === 0) {
        setOnlineFriends([]);
        return;
      }
      const ids = following.map((f) => f.id);
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { data } = await supabase
        .from("user_sessions")
        .select("user_id")
        .in("user_id", ids)
        .gte("last_seen", cutoff);

      const onlineIds = new Set((data || []).map((s) => s.user_id));
      setOnlineFriends(following.filter((f) => onlineIds.has(f.id)));
    }
    fetchOnlineFriends();
    const interval = setInterval(fetchOnlineFriends, 15_000);
    return () => clearInterval(interval);
  }, [following]);

  // ── Displayed list based on tab ──
  const displayedBuilders = useMemo(() => {
    if (activeTab === "Following") return following;
    if (activeTab === "Followers") return followers;
    if (activeTab === "Requests") return pendingRequests;
    return allBuilders;
  }, [activeTab, following, followers, pendingRequests, allBuilders]);

  return (
    <DashboardLayout pageTitle="NETWORK">
      <div className="d-content net-content">
        {/* ═══════ HERO ═══════ */}
        <motion.div className="net-hero" variants={fadeUp} initial="hidden" animate="visible">
          <div className="net-hero-left">
            <h1>YOUR NETWORK</h1>
            <p>Follow builders. Track progress together.</p>
          </div>
          <div className="net-hero-stats">
            <div className="net-stat">
              <span className="net-stat-label">FOLLOWING</span>
              <span className="net-stat-value">{following.length}</span>
            </div>
            <div className="net-stat">
              <span className="net-stat-label">FOLLOWERS</span>
              <span className="net-stat-value">{followers.length}</span>
            </div>
            <div className="net-stat">
              <span className="net-stat-label">FRIENDS ONLINE</span>
              <span className="net-stat-value" style={{ color: "#10B981" }}>
                {friendsOnline}
              </span>
            </div>
          </div>
        </motion.div>

        {/* ═══════ SEARCH BAR ═══════ */}
        <motion.div
          className="net-search-bar"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <span className="net-search-icon">⌕</span>
          <input
            type="text"
            className="net-search-input"
            placeholder="Search builders by name, focus, or identity…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </motion.div>

        {/* ═══════ TABS ═══════ */}
        <motion.div
          className="net-tabs"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`net-tab ${activeTab === tab ? "net-tab-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tab === "Following" && ` (${following.length})`}
              {tab === "Followers" && ` (${followers.length})`}
              {tab === "Requests" && pendingRequests.length > 0 && (
                <span style={{ 
                  background: "#EF4444", 
                  color: "white", 
                  borderRadius: "10px", 
                  padding: "1px 7px", 
                  fontSize: "0.7rem", 
                  marginLeft: "6px",
                  fontWeight: "700"
                }}>
                  {pendingRequests.length}
                </span>
              )}
            </button>
          ))}
        </motion.div>

        {/* ═══════ MAIN AREA ═══════ */}
        <div className="net-main">
          {/* Builder List */}
          <motion.div
            className="net-builder-grid"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
          >
            <AnimatePresence mode="popLayout">
              {displayedBuilders.map((builder) => {
                // Get deterministic follow state
                const followState = getFollowState(builder.id);
                const { status, loading: stateLoading } = followState;
                
                // Determine button props based on state machine
                let buttonLabel = "Follow";
                let buttonClass = "net-follow-btn-follow";
                let buttonAction = () => follow(builder.id, builder.is_private);
                let buttonDisabled = stateLoading;
                
                if (activeTab === "Requests") {
                  // Requests tab - always show Accept
                  buttonLabel = "Accept";
                  buttonClass = "net-follow-btn-follow";
                  buttonAction = () => acceptFollowRequest(builder.id);
                } else {
                  // Discover/Following/Followers tabs - state machine
                  if (status === 'self') {
                    buttonLabel = "You";
                    buttonClass = "net-follow-btn-following";
                    buttonDisabled = true;
                  } else if (status === 'pending') {
                    buttonLabel = "Requested";
                    buttonClass = "net-follow-btn-following";
                    buttonAction = () => unfollow(builder.id);
                  } else if (status === 'mutual') {
                    buttonLabel = "Friends";
                    buttonClass = "net-follow-btn-following";
                    buttonAction = () => unfollow(builder.id);
                  } else if (status === 'accepted') {
                    buttonLabel = "Following";
                    buttonClass = "net-follow-btn-following";
                    buttonAction = () => unfollow(builder.id);
                  } else {
                    buttonLabel = "Follow";
                    buttonClass = "net-follow-btn-follow";
                    buttonAction = () => follow(builder.id, builder.is_private);
                  }
                }
                
                return (
                  <motion.div
                    key={builder.id}
                    className="net-builder-card"
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="net-builder-info">
                      <div className="net-builder-name">
                        {builder.identity || builder.becoming || "Anonymous"}
                        <StreakBadge streak={builder.streak || 0} size="sm" />
                      </div>
                      <div className="net-builder-meta">
                        <span className="net-builder-focus">
                          {builder.becoming || builder.focus || "—"}
                        </span>
                        <span className="net-builder-stat">
                          Lv. <strong>{builder.level || 0}</strong>
                        </span>
                        <span className="net-builder-stat">
                          <strong>{(builder.xp || 0).toLocaleString()}</strong> XP
                        </span>
                      </div>
                    </div>
                    <button
                      className={`net-follow-btn ${buttonClass}`}
                      onClick={buttonAction}
                      disabled={buttonDisabled}
                      style={{ opacity: buttonDisabled ? 0.5 : 1 }}
                    >
                      {stateLoading ? "..." : buttonLabel}
                    </button>
                    {activeTab === "Requests" && (
                      <button
                        className="net-follow-btn net-follow-btn-following"
                        style={{ marginLeft: "6px", opacity: 0.6 }}
                        onClick={() => declineFollowRequest(builder.id)}
                      >
                        Decline
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {displayedBuilders.length === 0 && (
              <div className="net-empty">
                {searchLoading || followLoading ? (
                  <p>Loading…</p>
                ) : activeTab === "Following" ? (
                  <p>You're not following anyone yet. Discover builders above!</p>
                ) : activeTab === "Followers" ? (
                  <p>No followers yet. Build your streak to attract followers!</p>
                ) : (
                  <p>No builders found. Try a different search.</p>
                )}
              </div>
            )}
          </motion.div>

          {/* ═══════ SIDE PANEL ═══════ */}
          <div className="net-side">
            {/* Friends Online */}
            <motion.div
              className="net-side-card"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.25 }}
            >
              <h3>FRIENDS ONLINE ({onlineFriends.length})</h3>
              {onlineFriends.length > 0 ? (
                onlineFriends.map((friend) => (
                  <div key={friend.id} className="net-friend-online">
                    <span className="net-friend-online-dot" />
                    <span className="net-friend-name">
                      {friend.identity || friend.becoming || "Anonymous"}
                    </span>
                    <span className="net-friend-level">Lv. {friend.level || 0}</span>
                  </div>
                ))
              ) : (
                <div className="net-empty" style={{ padding: "16px 0" }}>
                  <p>No friends online right now.</p>
                </div>
              )}
            </motion.div>

            {/* Following Activity Feed */}
            <motion.div
              className="net-side-card"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.3 }}
            >
              <h3>FOLLOWING ACTIVITY</h3>
              {followingFeed.length > 0 ? (
                followingFeed.slice(0, 10).map((item) => (
                  <div key={item.id} className="net-feed-item">
                    <span className={`net-feed-dot net-feed-dot-${item.type}`} />
                    <div className="net-feed-text">
                      <span className="net-feed-user">{item.username}</span>
                      <p className="net-feed-desc">
                        {feedDescription(item.type, item.meta)}
                      </p>
                    </div>
                    <span className="net-feed-time">
                      {formatTime(item.timestamp)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="net-empty" style={{ padding: "16px 0" }}>
                  <p>Follow builders to see their activity here.</p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
