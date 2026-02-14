import React from "react";

export default function DailyCheckInCard({ checking, onCheckIn, showConfirmation, onSignOut }) {
  return (
    <div className="dashboard-card-surface checkin-card">
      <div className="panel-heading">
        <span className="panel-title">Daily Check-In</span>
        <button type="button" className="panel-link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <p className="panel-copy">Log who you became today to keep your identity streak alive.</p>
      <button
        className={`checkin-button ${checking ? "checking" : ""}`}
        onClick={onCheckIn}
        disabled={checking}
      >
        {checking ? "Checking in..." : "I showed up today"}
      </button>
      {showConfirmation && (
        <div className="checkin-confirmation">You showed up.</div>
      )}
    </div>
  );
}
