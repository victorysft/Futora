import { useState, useCallback, useEffect, useRef } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useFocus } from "../hooks/useFocus";
import "./Focus.css";

/* ═══════════════════════════════════════════
   FOCUS – Personal Command Center
   Psychological Commitment Engine
   ═══════════════════════════════════════════ */

const PRIVACY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "friends", label: "Friends" },
  { value: "private", label: "Private" },
];

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMin(min) {
  if (!min || min < 1) return "0m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ═══════════════════════════════════════════
   XP TOAST — reward animation on task complete
   ═══════════════════════════════════════════ */
function XPRewardToast({ xpToast }) {
  if (!xpToast) return null;
  return (
    <div className="focus-xp-toast" key={xpToast.taskTitle}>
      <span className="focus-xp-toast-amount">+{xpToast.amount} XP</span>
      <span className="focus-xp-toast-label">{xpToast.taskTitle}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SETUP FORM — with cooldown enforcement
   ═══════════════════════════════════════════ */
function FocusSetup({ profile, onCreate, saving, canCreateFocus, cooldownRemaining, error }) {
  const [form, setForm] = useState({
    title: profile?.focus || "",
    becoming_role: profile?.becoming || "",
    mission_statement: "",
    target_end_date: "",
    weekly_hours_target: "10",
  });

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCreate = () => {
    if (!form.title.trim() || !canCreateFocus) return;
    onCreate({
      ...form,
      weekly_hours_target: parseFloat(form.weekly_hours_target) || 10,
      target_end_date: form.target_end_date || null,
    });
  };

  return (
    <div className="focus-setup">
      <div className="focus-setup-icon">◎</div>
      <h2>Define Your Focus</h2>
      <p>
        One focus. Total commitment. Everything on this page exists to serve
        the single thing you're building toward.
      </p>

      {cooldownRemaining > 0 && (
        <div className="focus-cooldown-notice">
          <span className="focus-cooldown-icon">⏳</span>
          <div>
            <strong>Commitment cooldown active</strong>
            <p>You archived your last focus recently. New focus unlocks in <strong>{cooldownRemaining} day{cooldownRemaining !== 1 ? "s" : ""}.</strong></p>
            <p className="focus-cooldown-why">This prevents impulsive switching. Stay committed.</p>
          </div>
        </div>
      )}

      <div className={`focus-setup-form${cooldownRemaining > 0 ? " locked" : ""}`}>
        <div className="focus-field">
          <label>Focus Title</label>
          <input
            type="text"
            value={form.title}
            onChange={set("title")}
            placeholder="e.g. Launch my SaaS product"
            disabled={cooldownRemaining > 0}
            autoFocus
          />
        </div>

        <div className="focus-field">
          <label>Becoming</label>
          <input
            type="text"
            value={form.becoming_role}
            onChange={set("becoming_role")}
            placeholder="e.g. A disciplined founder"
            disabled={cooldownRemaining > 0}
          />
        </div>

        <div className="focus-field">
          <label>Mission Statement</label>
          <textarea
            value={form.mission_statement}
            onChange={set("mission_statement")}
            placeholder="One sentence. What are you committing to?"
            rows={2}
            disabled={cooldownRemaining > 0}
          />
        </div>

        <div className="focus-setup-row">
          <div className="focus-field">
            <label>Target End Date</label>
            <input
              type="date"
              value={form.target_end_date}
              onChange={set("target_end_date")}
              disabled={cooldownRemaining > 0}
            />
          </div>
          <div className="focus-field">
            <label>Weekly Hours Target</label>
            <input
              type="number"
              min="1"
              max="80"
              step="0.5"
              value={form.weekly_hours_target}
              onChange={set("weekly_hours_target")}
              disabled={cooldownRemaining > 0}
            />
          </div>
        </div>

        <button
          className="focus-btn-primary focus-btn-lockin"
          onClick={handleCreate}
          disabled={saving || !form.title.trim() || !canCreateFocus}
        >
          {saving ? "Locking in..." : "Lock In Focus"}
        </button>

        {error && (
          <div className="focus-error">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   BREAK COMMITMENT MODAL
   ═══════════════════════════════════════════ */
function BreakCommitmentModal({ focus, onConfirm, onClose, saving }) {
  const [typed, setTyped] = useState("");
  const requiredPhrase = "BREAK COMMITMENT";
  const canConfirm = typed.toUpperCase() === requiredPhrase;

  return (
    <div className="focus-edit-overlay" onClick={onClose}>
      <div className="focus-break-modal" onClick={(e) => e.stopPropagation()}>
        <div className="focus-break-icon">⚠</div>
        <h3>Break Your Commitment?</h3>
        <p className="focus-break-text">
          You committed to <strong>"{focus.title}"</strong>. Archiving starts a
          <strong> 7-day cooldown</strong> before you can create a new focus.
        </p>
        <p className="focus-break-sub">
          This is by design. Commitment means something here.
        </p>

        <div className="focus-field">
          <label>Type "{requiredPhrase}" to confirm</label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={requiredPhrase}
            autoFocus
          />
        </div>

        <div className="focus-edit-actions">
          <button className="focus-btn-cancel" onClick={onClose}>Keep Focus</button>
          <button
            className="focus-btn-primary focus-btn-danger"
            onClick={onConfirm}
            disabled={!canConfirm || saving}
          >
            {saving ? "Archiving..." : "Archive Focus"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EDIT MODAL
   ═══════════════════════════════════════════ */
function EditModal({ focus, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    title: focus.title || "",
    becoming_role: focus.becoming_role || "",
    mission_statement: focus.mission_statement || "",
    target_end_date: focus.target_end_date || "",
    weekly_hours_target: String(focus.weekly_hours_target || 10),
  });

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = () => {
    onSave({
      ...form,
      weekly_hours_target: parseFloat(form.weekly_hours_target) || 10,
      target_end_date: form.target_end_date || null,
    });
  };

  return (
    <div className="focus-edit-overlay" onClick={onClose}>
      <div className="focus-edit-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Focus</h3>

        <div className="focus-field">
          <label>Focus Title</label>
          <input type="text" value={form.title} onChange={set("title")} />
        </div>

        <div className="focus-field">
          <label>Becoming</label>
          <input type="text" value={form.becoming_role} onChange={set("becoming_role")} />
        </div>

        <div className="focus-field">
          <label>Mission Statement</label>
          <textarea value={form.mission_statement} onChange={set("mission_statement")} rows={2} />
        </div>

        <div className="focus-setup-row">
          <div className="focus-field">
            <label>Target End Date</label>
            <input type="date" value={form.target_end_date} onChange={set("target_end_date")} />
          </div>
          <div className="focus-field">
            <label>Weekly Hours Target</label>
            <input
              type="number"
              min="1"
              max="80"
              step="0.5"
              value={form.weekly_hours_target}
              onChange={set("weekly_hours_target")}
            />
          </div>
        </div>

        <div className="focus-edit-actions">
          <button className="focus-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="focus-btn-primary"
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FOCUS IDENTITY CARD (header)
   ═══════════════════════════════════════════ */
function FocusIdentityCard({
  focus,
  profile,
  daysSinceStart,
  totalDays,
  onEdit,
  onArchive,
  onPrivacyChange,
  saving,
}) {
  return (
    <div className="focus-header">
      <div className="focus-header-left">
        {(focus.becoming_role || profile?.becoming) && (
          <span className="focus-header-role">
            BECOMING {(focus.becoming_role || profile?.becoming).toUpperCase()}
          </span>
        )}
        <h1 className="focus-header-title">{focus.title}</h1>
        <div className="focus-header-meta">
          <div className="focus-meta-item">
            <span className="focus-meta-label">Started</span>
            <span className="focus-meta-value">{fmtDate(focus.start_date)}</span>
          </div>
          <div className="focus-meta-divider" />
          <div className="focus-meta-item">
            <span className="focus-meta-label">Day</span>
            <span className="focus-meta-value focus-meta-highlight">{daysSinceStart} / {totalDays}</span>
          </div>
          <div className="focus-meta-divider" />
          <div className="focus-meta-item">
            <span className="focus-meta-label">Streak</span>
            <span className="focus-meta-value">{profile?.streak || 0}d</span>
          </div>
          <div className="focus-meta-divider" />
          <div className="focus-meta-item">
            <span className="focus-meta-label">XP</span>
            <span className="focus-meta-value focus-meta-purple">{(profile?.xp || 0).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="focus-header-right">
        <div className="focus-privacy-toggle">
          {PRIVACY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`focus-privacy-btn${focus.privacy === opt.value ? " active" : ""}`}
              onClick={() => onPrivacyChange(opt.value)}
              disabled={saving}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="focus-header-actions">
          <button className="focus-btn-sm" onClick={onEdit}>Edit</button>
          <button className="focus-btn-sm danger" onClick={onArchive}>Archive</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MISSION BLOCK + 90-day progress
   ═══════════════════════════════════════════ */
function MissionBlock({ focus, ninetyDayProgress, daysSinceStart, totalDays }) {
  const endDate = focus.target_end_date
    || new Date(new Date(focus.start_date + "T00:00:00").getTime() + 90 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);

  return (
    <div className="focus-card focus-mission">
      <div className="focus-card-label">MISSION</div>
      {focus.mission_statement ? (
        <p className="focus-mission-text">"{focus.mission_statement}"</p>
      ) : (
        <p className="focus-mission-text" style={{ opacity: 0.3 }}>
          No mission statement — edit your focus to add one.
        </p>
      )}
      <div className="focus-mission-bar-wrap">
        <div className="focus-mission-dates">
          <span className="focus-mission-date">{fmtDate(focus.start_date)}</span>
          <span className="focus-mission-pct">Day {daysSinceStart} of {totalDays} · {ninetyDayProgress}%</span>
          <span className="focus-mission-date">{fmtDate(endDate)}</span>
        </div>
        <div className="focus-progress-track">
          <div className="focus-progress-fill" style={{ width: `${ninetyDayProgress}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MOMENTUM METER — Cold → Unstoppable
   ═══════════════════════════════════════════ */
function MomentumMeter({ momentumTier, momentumDirection, streak, weeklyCompletion }) {
  return (
    <div className="focus-card focus-momentum-card">
      <div className="focus-card-label">MOMENTUM</div>
      <div className="focus-momentum-visual">
        <div
          className={`focus-momentum-ring ${momentumTier.key}`}
          style={{ "--tier-color": momentumTier.color }}
        >
          <span className="focus-momentum-score">{momentumTier.score}</span>
        </div>
        <div className="focus-momentum-info">
          <span
            className="focus-momentum-tier-label"
            style={{ color: momentumTier.color }}
          >
            {momentumTier.label}
          </span>
          <div className="focus-momentum-detail">
            <span className={`focus-momentum-arrow ${momentumDirection}`}>
              {momentumDirection === "rising" ? "↑" : "↓"}
            </span>
            <span className={`focus-momentum-dir ${momentumDirection}`}>
              {momentumDirection === "rising" ? "Rising" : "Falling"}
            </span>
          </div>
          <div className="focus-momentum-factors">
            <span>Streak: {streak}d</span>
            <span>Week: {weeklyCompletion}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   WEEKLY COMMITMENT ENGINE
   ═══════════════════════════════════════════ */
function WeeklyCommitment({ weeklyTarget, weeklyHoursActual, weeklyCompletion }) {
  const pctColor =
    weeklyCompletion >= 80 ? "#10B981" :
    weeklyCompletion >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <div className="focus-card">
      <div className="focus-card-label">WEEKLY COMMITMENT</div>
      <div className="focus-weekly-stats">
        <div className="focus-weekly-hero">
          <span className="focus-weekly-pct" style={{ color: pctColor }}>
            {weeklyCompletion}%
          </span>
          <span className="focus-weekly-of">of weekly target</span>
        </div>
        <div className="focus-progress-track focus-weekly-track">
          <div
            className="focus-progress-fill"
            style={{ width: `${weeklyCompletion}%`, background: pctColor }}
          />
        </div>
        <div className="focus-weekly-rows">
          <div className="focus-weekly-row">
            <span className="focus-weekly-label">Target</span>
            <span className="focus-weekly-value">{weeklyTarget}h</span>
          </div>
          <div className="focus-weekly-row">
            <span className="focus-weekly-label">Logged</span>
            <span className="focus-weekly-value">{weeklyHoursActual}h</span>
          </div>
          <div className="focus-weekly-row">
            <span className="focus-weekly-label">Remaining</span>
            <span className="focus-weekly-value">
              {Math.max(0, Math.round((weeklyTarget - weeklyHoursActual) * 10) / 10)}h
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TODAY'S TOP 3 — with XP reward display
   ═══════════════════════════════════════════ */
function TodaysTop3({ tasks, onToggle, onAdd, onRemove, saving, TASK_COMPLETE_XP }) {
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("");

  const handleAdd = useCallback(() => {
    if (!newTitle.trim() || tasks.length >= 3) return;
    const mins = parseInt(newTime, 10) || null;
    onAdd(newTitle.trim(), mins);
    setNewTitle("");
    setNewTime("");
  }, [newTitle, newTime, tasks.length, onAdd]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleAdd();
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="focus-card">
      <div className="focus-card-label">
        TODAY'S TOP 3
        {tasks.length > 0 && (
          <span className="focus-tasks-count">{completedCount}/{tasks.length}</span>
        )}
      </div>

      {tasks.length === 0 && (
        <p className="focus-tasks-empty">What 3 things move you forward today?</p>
      )}

      <div className="focus-tasks-list">
        {tasks.map((task, i) => (
          <div key={task.id} className={`focus-task-item${task.completed ? " completed" : ""}`}>
            <span className="focus-task-num">{i + 1}</span>
            <button
              className={`focus-task-check${task.completed ? " done" : ""}`}
              onClick={() => onToggle(task.id)}
              disabled={saving}
              aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
            >
              {task.completed && <span className="focus-task-checkmark">✓</span>}
            </button>
            <span className={`focus-task-title${task.completed ? " done" : ""}`}>
              {task.title}
            </span>
            {task.time_estimate && (
              <span className="focus-task-time">{fmtMin(task.time_estimate)}</span>
            )}
            {!task.completed && (
              <span className="focus-task-xp-hint">+{TASK_COMPLETE_XP} XP</span>
            )}
            <button
              className="focus-task-remove"
              onClick={() => onRemove(task.id)}
              disabled={saving}
              aria-label="Remove task"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {tasks.length < 3 && (
        <div className="focus-task-add">
          <input
            className="focus-task-input"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tasks.length === 0 ? "Most important task..." : "Next task..."}
            maxLength={120}
          />
          <input
            className="focus-task-time-input"
            type="number"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="min"
            min="1"
            max="480"
          />
          <button
            className="focus-task-add-btn"
            onClick={handleAdd}
            disabled={saving || !newTitle.trim()}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FOCUS STATS
   ═══════════════════════════════════════════ */
function FocusStats({ stats, totalHours, profile }) {
  return (
    <div className="focus-card">
      <div className="focus-card-label">FOCUS STATS</div>
      <div className="focus-stats-grid">
        <div className="focus-stat-item">
          <span className="focus-stat-value">{stats.totalSessions}</span>
          <span className="focus-stat-label">Sessions</span>
        </div>
        <div className="focus-stat-item">
          <span className="focus-stat-value">{totalHours}h</span>
          <span className="focus-stat-label">Total Hours</span>
        </div>
        <div className="focus-stat-item">
          <span className="focus-stat-value purple">{stats.totalXP.toLocaleString()}</span>
          <span className="focus-stat-label">XP Earned</span>
        </div>
        <div className="focus-stat-item">
          <span className="focus-stat-value">Lv {profile?.level || 1}</span>
          <span className="focus-stat-label">Current Level</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */
export default function Focus() {
  const { user, profile, refreshProfile } = useAuth();
  const {
    focus,
    tasks,
    stats,
    loading,
    saving,
    error,
    xpToast,
    daysSinceStart,
    totalDays,
    ninetyDayProgress,
    weeklyHoursActual,
    weeklyTarget,
    weeklyCompletion,
    momentumTier,
    momentumDirection,
    totalHours,
    streak,
    cooldownRemaining,
    canCreateFocus,
    TASK_COMPLETE_XP,
    createFocus,
    updateFocus,
    archiveFocus,
    addTask,
    removeTask,
    toggleTask,
  } = useFocus(user?.id);

  const [editOpen, setEditOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);

  const handlePrivacyChange = useCallback(
    (val) => updateFocus({ privacy: val }),
    [updateFocus]
  );

  const handleEditSave = useCallback(
    async (fields) => {
      await updateFocus(fields);
      setEditOpen(false);
    },
    [updateFocus]
  );

  const handleArchiveConfirm = useCallback(async () => {
    await archiveFocus();
    setBreakOpen(false);
  }, [archiveFocus]);

  // Refresh profile after XP awards
  const prevXpToast = useRef(null);
  useEffect(() => {
    if (xpToast && xpToast !== prevXpToast.current) {
      prevXpToast.current = xpToast;
      // Delay refresh so the DB update settles
      const t = setTimeout(() => refreshProfile?.(), 800);
      return () => clearTimeout(t);
    }
  }, [xpToast, refreshProfile]);

  const handleToggleTask = useCallback(async (taskId) => {
    await toggleTask(taskId);
  }, [toggleTask]);

  // ─── Loading ───
  if (loading) {
    return (
      <DashboardLayout pageTitle="MY FOCUS">
        <div className="d-loading-inner">LOADING...</div>
      </DashboardLayout>
    );
  }

  // ─── No active focus → setup ───
  if (!focus) {
    return (
      <DashboardLayout pageTitle="MY FOCUS">
        <FocusSetup
          profile={profile}
          onCreate={createFocus}
          saving={saving}
          canCreateFocus={canCreateFocus}
          cooldownRemaining={cooldownRemaining}
          error={error}
        />
      </DashboardLayout>
    );
  }

  // ─── Focus Command Center ───
  return (
    <DashboardLayout pageTitle="MY FOCUS">
      <div className="focus-center">
        <FocusIdentityCard
          focus={focus}
          profile={profile}
          daysSinceStart={daysSinceStart}
          totalDays={totalDays}
          onEdit={() => setEditOpen(true)}
          onArchive={() => setBreakOpen(true)}
          onPrivacyChange={handlePrivacyChange}
          saving={saving}
        />

        <MissionBlock
          focus={focus}
          ninetyDayProgress={ninetyDayProgress}
          daysSinceStart={daysSinceStart}
          totalDays={totalDays}
        />

        <div className="focus-grid">
          <MomentumMeter
            momentumTier={momentumTier}
            momentumDirection={momentumDirection}
            streak={streak}
            weeklyCompletion={weeklyCompletion}
          />

          <WeeklyCommitment
            weeklyTarget={weeklyTarget}
            weeklyHoursActual={weeklyHoursActual}
            weeklyCompletion={weeklyCompletion}
          />

          <TodaysTop3
            tasks={tasks}
            onToggle={handleToggleTask}
            onAdd={addTask}
            onRemove={removeTask}
            saving={saving}
            TASK_COMPLETE_XP={TASK_COMPLETE_XP}
          />

          <FocusStats stats={stats} totalHours={totalHours} profile={profile} />
        </div>
      </div>

      <XPRewardToast xpToast={xpToast} />

      {editOpen && (
        <EditModal
          focus={focus}
          onSave={handleEditSave}
          onClose={() => setEditOpen(false)}
          saving={saving}
        />
      )}

      {breakOpen && (
        <BreakCommitmentModal
          focus={focus}
          onConfirm={handleArchiveConfirm}
          onClose={() => setBreakOpen(false)}
          saving={saving}
        />
      )}
    </DashboardLayout>
  );
}
