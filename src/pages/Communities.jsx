import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useCommunityList } from "../hooks/useCommunities";
import "./Communities.css";

/* ═══════════════════════════════════════════
   FUTORA · Communities — Collective Intelligence Hub
   ═══════════════════════════════════════════ */

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const CATEGORY_ICONS = {
  tech: "⚡", fitness: "🏋️", creative: "🎨", study: "📚",
  business: "💼", mindset: "🧠", health: "❤️", default: "🌐",
};

function getCatIcon(cat) {
  return CATEGORY_ICONS[cat?.toLowerCase()] || CATEGORY_ICONS.default;
}

/* ══════════════════════════════════════════════════════════
   CREATE MODAL
   ══════════════════════════════════════════════════════════ */
function CreateModal({ open, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [rules, setRules] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    const result = await onCreate({ name, description, category, rules, isPrivate });
    setCreating(false);
    if (result) {
      setName(""); setDescription(""); setCategory(""); setRules("");
      onClose();
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="cm-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="cm-modal"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="cm-modal-title">Create Community</h2>

          <div className="cm-field">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Deep Focus Labs"
              maxLength={60}
            />
          </div>

          <div className="cm-field">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this community about?"
              maxLength={300}
              rows={3}
            />
          </div>

          <div className="cm-field">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select…</option>
              <option value="tech">Tech</option>
              <option value="fitness">Fitness</option>
              <option value="creative">Creative</option>
              <option value="study">Study</option>
              <option value="business">Business</option>
              <option value="mindset">Mindset</option>
              <option value="health">Health</option>
            </select>
          </div>

          <div className="cm-field">
            <label>Rules (optional)</label>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="Community guidelines…"
              maxLength={500}
              rows={2}
            />
          </div>

          <label className="cm-toggle-row">
            <span>Private community</span>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
          </label>

          <div className="cm-modal-actions">
            <button className="cm-btn-cancel" onClick={onClose}>Cancel</button>
            <button
              className="cm-btn-create"
              onClick={handleSubmit}
              disabled={!name.trim() || creating}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════════════════════════
   COMMUNITY CARD
   ══════════════════════════════════════════════════════════ */
function CommunityCard({ community, isMember, onJoin, onLeave, onOpen }) {
  return (
    <motion.div className="cm-card" variants={fadeUp}>
      <div className="cm-card-top" onClick={onOpen}>
        <div className="cm-card-icon">{getCatIcon(community.category)}</div>
        <div className="cm-card-info">
          <div className="cm-card-name-row">
            <span className="cm-card-name">{community.name}</span>
            {community.is_private && <span className="cm-private-tag">Private</span>}
          </div>
          {community.description && (
            <p className="cm-card-desc">{community.description}</p>
          )}
        </div>
      </div>
      <div className="cm-card-bottom">
        <div className="cm-card-stats">
          <span>{community.members_count || 0} members</span>
          {community.category && <span className="cm-card-cat">{community.category}</span>}
        </div>
        {isMember ? (
          <button className="cm-btn-joined" onClick={onLeave}>Joined ✓</button>
        ) : (
          <button className="cm-btn-join" onClick={onJoin}>Join</button>
        )}
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════
   COMMUNITIES PAGE
   ══════════════════════════════════════════════════════════ */
export default function Communities() {
  const { user } = useAuth();
  const userId = user?.id;
  const {
    communities,
    myCommunities,
    loading,
    createCommunity,
    joinCommunity,
    leaveCommunity,
  } = useCommunityList(userId);

  const [view, setView] = useState("browse"); // browse | mine
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const myIds = new Set(myCommunities.map((c) => c.id));

  const filtered = (view === "mine" ? myCommunities : communities).filter(
    (c) => !search || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="cm-page">
        {/* Header */}
        <motion.div
          className="cm-header"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="cm-header-left">
            <h1 className="cm-title">Communities</h1>
            <p className="cm-subtitle">Join focused groups, level up together</p>
          </div>
          <button className="cm-create-btn" onClick={() => setShowCreate(true)}>
            + Create
          </button>
        </motion.div>

        {/* Tabs + Search */}
        <div className="cm-controls">
          <div className="cm-view-tabs">
            <button
              className={`cm-vtab${view === "browse" ? " active" : ""}`}
              onClick={() => setView("browse")}
            >
              Browse
            </button>
            <button
              className={`cm-vtab${view === "mine" ? " active" : ""}`}
              onClick={() => setView("mine")}
            >
              My Communities ({myCommunities.length})
            </button>
          </div>
          <input
            className="cm-search"
            placeholder="Search communities…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Grid */}
        <motion.div
          className="cm-grid"
          variants={stagger}
          initial="hidden"
          animate="visible"
          key={view}
        >
          {loading ? (
            <div className="cm-loading">
              <div className="cm-spinner" />
              <span>Loading communities…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="cm-empty">
              <span className="cm-empty-icon">🏛</span>
              <h3>{view === "mine" ? "No communities yet" : "Nothing found"}</h3>
              <p>{view === "mine" ? "Create or join one to get started" : "Try a different search"}</p>
            </div>
          ) : (
            filtered.map((c) => (
              <CommunityCard
                key={c.id}
                community={c}
                isMember={myIds.has(c.id)}
                onJoin={() => joinCommunity(c.id)}
                onLeave={() => leaveCommunity(c.id)}
                onOpen={() => navigate(`/communities/${c.slug || c.id}`)}
              />
            ))
          )}
        </motion.div>

        {/* Create Modal */}
        <CreateModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreate={createCommunity}
        />
      </div>
    </DashboardLayout>
  );
}
