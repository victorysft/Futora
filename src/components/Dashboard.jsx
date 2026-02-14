import { formatDate } from "../utils/streak";

export default function Dashboard({
  goal,
  streak,
  lastCheckIn,
  checkedInToday,
  onCheckIn,
  onReset,
}) {
  return (
    <div className="dashboard">
      <div className="mission">
        <span className="label">Your mission</span>
        <h2 className="mission-text">{goal}</h2>
      </div>

      <div className="rule" />

      <div className="metrics">
        <div className="metric">
          <span className="metric-value">{streak}</span>
          <span className="metric-label">day streak</span>
        </div>
        <div className="metric-divider" />
        <div className="metric">
          <span className="metric-value metric-date">
            {lastCheckIn ? formatDate(lastCheckIn) : "—"}
          </span>
          <span className="metric-label">last check-in</span>
        </div>
      </div>

      <div className="rule" />

      {!checkedInToday ? (
        <button className="btn-checkin" onClick={onCheckIn}>
          I became that person today
        </button>
      ) : (
        <div className="confirmed">
          <span className="confirmed-mark">&#10003;</span>
          Logged. Keep going.
        </div>
      )}

      <button className="btn-reset" onClick={onReset}>
        Start over
      </button>
    </div>
  );
}
