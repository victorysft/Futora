import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function DailyCheckIn({ userId, goalId, existingCheckin, onSaved }) {
  const [didWork, setDidWork] = useState(existingCheckin?.completed ?? true);
  const [minutesWorked, setMinutesWorked] = useState(existingCheckin?.minutes_worked ?? 30);
  const [energyLevel, setEnergyLevel] = useState(existingCheckin?.energy_level ?? 5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isLocked = Boolean(existingCheckin);

  useEffect(() => {
    if (!existingCheckin) return;
    setDidWork(existingCheckin.completed);
    setMinutesWorked(existingCheckin.minutes_worked ?? 0);
    setEnergyLevel(existingCheckin.energy_level ?? 5);
  }, [existingCheckin]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (isLocked || saving) return;

    setSaving(true);
    setError("");

    const safeMinutes = didWork ? Math.max(0, Number(minutesWorked) || 0) : 0;
    const safeEnergy = Math.min(10, Math.max(1, Number(energyLevel) || 1));

    const { data, error: insertError } = await supabase
      .from("checkins")
      .insert({
        user_id: userId,
        goal_id: goalId,
        minutes_worked: safeMinutes,
        energy_level: safeEnergy,
        completed: didWork,
      })
      .select("id, goal_id, minutes_worked, energy_level, completed, created_at")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    onSaved(data);
    setSaving(false);
  };

  return (
    <form className="checkin" onSubmit={handleSave}>
      <p className="checkin-title">Today&apos;s Check-In</p>

      <div className="checkin-toggle">
        <span className="checkin-label">Did you work today?</span>
        <div className="toggle-buttons">
          <button
            className={`toggle-btn ${didWork ? "active" : ""}`}
            type="button"
            onClick={() => setDidWork(true)}
            disabled={isLocked}
          >
            Yes
          </button>
          <button
            className={`toggle-btn ${!didWork ? "active" : ""}`}
            type="button"
            onClick={() => setDidWork(false)}
            disabled={isLocked}
          >
            No
          </button>
        </div>
      </div>

      <div className="checkin-field">
        <label className="checkin-label" htmlFor={`minutes-${goalId}`}>Minutes worked</label>
        <input
          id={`minutes-${goalId}`}
          className="input"
          type="number"
          min={0}
          value={minutesWorked}
          onChange={(event) => setMinutesWorked(event.target.value)}
          disabled={isLocked || !didWork}
        />
      </div>

      <div className="checkin-field">
        <label className="checkin-label" htmlFor={`energy-${goalId}`}>
          Energy level: {energyLevel}
        </label>
        <input
          id={`energy-${goalId}`}
          className="checkin-range"
          type="range"
          min={1}
          max={10}
          step={1}
          value={energyLevel}
          onChange={(event) => setEnergyLevel(event.target.value)}
          disabled={isLocked}
        />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <button className="btn-commit" type="submit" disabled={isLocked || saving}>
        {isLocked ? "Already checked in today" : saving ? "Saving..." : "Save check-in"}
      </button>
    </form>
  );
}
