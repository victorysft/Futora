import { useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { useProgress } from "../hooks/useProgress";
import "./Progress.css";

/* ═══════════════════════════════════════════
   FUTORA · Progress – Psychological Reinforcement Center
   ═══════════════════════════════════════════ */

/* ── Format helpers ── */
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtNum(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ═══════ OVERVIEW CARD ═══════ */
function OverviewCard({ overview }) {
  const metrics = [
    { value: overview.currentStreak, label: "Current Streak", suffix: "d" },
    { value: overview.longestStreak, label: "Longest Streak", suffix: "d" },
    { value: overview.totalHours, label: "Total Focus Hours", suffix: "h" },
    { value: fmtNum(overview.totalXP), label: "Total XP Earned", accent: true },
  ];

  return (
    <div className="prog-card prog-overview">
      <h2 className="prog-overview-title">Progress Overview</h2>
      <div className="prog-metrics-row">
        {metrics.map((m, i) => (
          <div key={i} className="prog-metric">
            <span className={`prog-metric-num${m.accent ? " accent" : ""}`}>
              {m.value}{m.suffix || ""}
            </span>
            <span className="prog-metric-label">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════ WEEKLY GRAPH ═══════ */
function WeeklyGraph({ weeklyData, completionPct }) {
  const W = 560;
  const H = 100;
  const PAD_X = 20;
  const PAD_Y = 12;

  const graphData = useMemo(() => {
    if (!weeklyData.length) return { path: "", area: "", dots: [] };

    const values = weeklyData.map(d => d.hours);
    const max = Math.max(...values, 0.5);
    const xStep = (W - PAD_X * 2) / Math.max(values.length - 1, 1);

    const points = values.map((v, i) => ({
      x: PAD_X + i * xStep,
      y: H - PAD_Y - (v / max) * (H - PAD_Y * 2),
    }));

    if (points.length < 2) return { path: "", area: "", dots: points };

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cx = (points[i].x + points[i + 1].x) / 2;
      path += ` C ${cx} ${points[i].y}, ${cx} ${points[i + 1].y}, ${points[i + 1].x} ${points[i + 1].y}`;
    }

    const area = path
      + ` L ${points[points.length - 1].x} ${H - PAD_Y}`
      + ` L ${points[0].x} ${H - PAD_Y} Z`;

    return { path, area, dots: points };
  }, [weeklyData]);

  const gridLines = [0.25, 0.5, 0.75].map(pct => H - PAD_Y - pct * (H - PAD_Y * 2));

  return (
    <div className="prog-card prog-weekly">
      <div className="prog-card-label">Last 7 Days</div>
      <div className="prog-graph-container">
        <svg
          className="prog-graph-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          height="100"
        >
          <defs>
            <linearGradient id="progGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map((y, i) => (
            <line
              key={i}
              className="prog-graph-grid-line"
              x1={PAD_X}
              y1={y}
              x2={W - PAD_X}
              y2={y}
            />
          ))}

          {graphData.area && (
            <path className="prog-graph-area" d={graphData.area} />
          )}
          {graphData.path && (
            <path className="prog-graph-line" d={graphData.path} />
          )}
          {graphData.dots.map((dot, i) => (
            <circle
              key={i}
              className="prog-graph-dot"
              cx={dot.x}
              cy={dot.y}
              r="3.5"
            />
          ))}
        </svg>

        <div className="prog-graph-labels">
          {weeklyData.map((d, i) => (
            <span key={i} className="prog-graph-day">{d.label}</span>
          ))}
        </div>
      </div>

      <div className="prog-weekly-summary">
        <span className="prog-weekly-pct">{completionPct}%</span>
        <span className="prog-weekly-sub">Based on your weekly target</span>
      </div>
    </div>
  );
}

/* ═══════ HEATMAP ═══════ */
function DisciplineHeatmap({ heatmapData }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <div className="prog-card prog-heatmap">
      <div className="prog-card-label">Discipline Map</div>
      <div className="prog-heatmap-grid">
        {heatmapData.map((day, i) => (
          <div
            key={day.date}
            className={`prog-heat-cell${day.level > 0 ? ` level-${day.level}` : ""}`}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {hoveredIdx === i && (
              <div className="prog-heat-tooltip">
                <span className="prog-heat-tooltip-date">{fmtDate(day.date)}</span>
                <span>{day.sessions} session{day.sessions !== 1 ? "s" : ""}</span>
                <span>{day.minutes} min</span>
                {day.xp > 0 && <span>{day.xp} XP</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="prog-heatmap-legend">
        <span className="prog-legend-label">Less</span>
        <div className="prog-legend-cell" style={{ background: "rgba(255,255,255,0.03)" }} />
        <div className="prog-legend-cell" style={{ background: "rgba(139,92,246,0.15)" }} />
        <div className="prog-legend-cell" style={{ background: "rgba(139,92,246,0.3)" }} />
        <div className="prog-legend-cell" style={{ background: "rgba(139,92,246,0.5)" }} />
        <div className="prog-legend-cell" style={{ background: "rgba(139,92,246,0.75)" }} />
        <span className="prog-legend-label">More</span>
      </div>
    </div>
  );
}

/* ═══════ PERFORMANCE BREAKDOWN ═══════ */
function PerformanceBreakdown({ performance }) {
  const trendLabel = {
    improving: "Improving",
    stable: "Stable",
    declining: "Declining",
  };

  const trendIcon = {
    improving: "\u25B2",
    stable: "\u2014",
    declining: "\u25BC",
  };

  return (
    <div className="prog-card">
      <div className="prog-card-label">Performance</div>
      <div className="prog-perf-grid">
        <div className="prog-perf-section">
          <div className="prog-perf-title">Focus Sessions</div>
          <div className="prog-perf-row">
            <span className="prog-perf-key">Total Sessions</span>
            <span className="prog-perf-val">{performance.totalSessions}</span>
          </div>
          <div className="prog-perf-row">
            <span className="prog-perf-key">Avg Session Length</span>
            <span className="prog-perf-val">{performance.avgSessionMin}m</span>
          </div>
          {performance.mostProductiveDay && (
            <div className="prog-perf-row">
              <span className="prog-perf-key">Most Productive Day</span>
              <span className="prog-perf-val">{performance.mostProductiveDay}</span>
            </div>
          )}
        </div>

        <div className="prog-perf-section">
          <div className="prog-perf-title">Commitment Analysis</div>
          <div className="prog-perf-row">
            <span className="prog-perf-key">Weekly Target</span>
            <span className="prog-perf-val">{performance.weeklyTargetHours}h</span>
          </div>
          <div className="prog-perf-row">
            <span className="prog-perf-key">Avg Achieved</span>
            <span className="prog-perf-val">{performance.avgAchievedPct}%</span>
          </div>
          <div className="prog-perf-row">
            <span className="prog-perf-key">Missed Days (30d)</span>
            <span className="prog-perf-val">{performance.missedDays30}</span>
          </div>
          <div className="prog-perf-row">
            <span className="prog-perf-key">Trend</span>
            <span className={`prog-trend ${performance.trend}`}>
              {trendIcon[performance.trend]} {trendLabel[performance.trend]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════ XP GROWTH CURVE ═══════ */
function XPGrowthCurve({ xpCurve, xpInsight }) {
  const W = 560;
  const H = 100;
  const PAD_X = 20;
  const PAD_Y = 12;

  const graphData = useMemo(() => {
    if (!xpCurve.length) return { path: "", area: "", dots: [] };

    const values = xpCurve.map(d => d.xp);
    const max = Math.max(...values, 1);
    const min = Math.min(...values);
    const range = max - min || 1;
    const xStep = (W - PAD_X * 2) / Math.max(values.length - 1, 1);

    const points = values.map((v, i) => ({
      x: PAD_X + i * xStep,
      y: H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2),
    }));

    if (points.length < 2) return { path: "", area: "", dots: points };

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cx = (points[i].x + points[i + 1].x) / 2;
      path += ` C ${cx} ${points[i].y}, ${cx} ${points[i + 1].y}, ${points[i + 1].x} ${points[i + 1].y}`;
    }

    const area = path
      + ` L ${points[points.length - 1].x} ${H - PAD_Y}`
      + ` L ${points[0].x} ${H - PAD_Y} Z`;

    const dots = points.filter((_, i) => i === 0 || i === points.length - 1 || i % 5 === 0);

    return { path, area, dots };
  }, [xpCurve]);

  const dateLabels = useMemo(() => {
    if (xpCurve.length < 2) return [];
    const step = Math.max(1, Math.floor(xpCurve.length / 5));
    const labels = [];
    for (let i = 0; i < xpCurve.length; i += step) {
      labels.push(fmtDate(xpCurve[i].date));
    }
    const lastLabel = fmtDate(xpCurve[xpCurve.length - 1].date);
    if (labels[labels.length - 1] !== lastLabel) labels.push(lastLabel);
    return labels;
  }, [xpCurve]);

  return (
    <div className="prog-card prog-xp-card">
      <div className="prog-card-label">XP Growth</div>
      <div className="prog-graph-container">
        <svg
          className="prog-graph-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          height="100"
        >
          <defs>
            <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {graphData.area && (
            <path d={graphData.area} fill="url(#xpGradient)" opacity="0.2" />
          )}
          {graphData.path && (
            <path className="prog-graph-line" d={graphData.path} />
          )}
          {graphData.dots.map((dot, i) => (
            <circle
              key={i}
              className="prog-graph-dot"
              cx={dot.x}
              cy={dot.y}
              r="3"
            />
          ))}
        </svg>

        <div className="prog-graph-labels">
          {dateLabels.map((label, i) => (
            <span key={i} className="prog-graph-day">{label}</span>
          ))}
        </div>
      </div>

      {xpInsight && (
        <p className="prog-xp-insight">{xpInsight}</p>
      )}
    </div>
  );
}

/* ═══════ EMPTY STATE ═══════ */
function EmptyState() {
  return (
    <div className="prog-empty">
      <div className="prog-empty-icon">◎</div>
      <h3 className="prog-empty-title">Start tracking to unlock insights</h3>
      <p className="prog-empty-sub">
        Check in daily and complete focus sessions to see your progress data appear here.
      </p>
    </div>
  );
}

/* ═══════ MAIN COMPONENT ═══════ */
export default function Progress() {
  const { user } = useAuth();
  const {
    loading,
    overview,
    weeklyData,
    weeklyCompletionPct,
    heatmapData,
    performance,
    xpCurve,
    xpInsight,
  } = useProgress(user?.id);

  if (loading) {
    return (
      <DashboardLayout pageTitle="PROGRESS">
        <div className="prog-content">
          <div style={{ color: "rgba(255,255,255,0.4)", padding: "3rem", textAlign: "center", fontSize: "0.8rem", letterSpacing: "0.15em" }}>
            LOADING...
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const hasData = overview.totalXP > 0 || overview.currentStreak > 0 || overview.totalHours > 0;

  return (
    <DashboardLayout pageTitle="PROGRESS">
      <div className="prog-content">
        {!hasData ? (
          <EmptyState />
        ) : (
          <>
            <OverviewCard overview={overview} />

            <WeeklyGraph
              weeklyData={weeklyData}
              completionPct={weeklyCompletionPct}
            />

            <DisciplineHeatmap heatmapData={heatmapData} />

            <PerformanceBreakdown performance={performance} />

            <XPGrowthCurve xpCurve={xpCurve} xpInsight={xpInsight} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
