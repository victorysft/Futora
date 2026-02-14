/**
 * Calculate Momentum Score (0–100) from checkin history.
 *
 * Components (weighted):
 *   40% – Consistency  (days with a completed checkin / total days since goal creation)
 *   25% – Current streak (consecutive completed days up to today, capped at 30)
 *   20% – Average energy (normalised 1–10 → 0–1)
 *   15% – Total minutes  (capped at 3000 min ≈ 50 h)
 */

export function calculateMomentum(checkins, goalCreatedAt) {
  if (!checkins || checkins.length === 0) {
    return { score: 0, consistency: 0, streak: 0, avgEnergy: 0, totalMinutes: 0 };
  }

  const now = new Date();
  const created = new Date(goalCreatedAt);
  const msPerDay = 86_400_000;
  const totalDays = Math.max(1, Math.ceil((now - created) / msPerDay));

  // --- completed set (yyyy-mm-dd) ---
  const completedDates = new Set();
  let totalEnergy = 0;
  let energyCount = 0;
  let totalMinutes = 0;

  for (const c of checkins) {
    if (c.completed) {
      completedDates.add(c.created_at.slice(0, 10));
    }
    if (c.energy_level != null) {
      totalEnergy += c.energy_level;
      energyCount += 1;
    }
    totalMinutes += c.minutes_worked ?? 0;
  }

  // --- consistency ---
  const consistency = Math.min(1, completedDates.size / totalDays);

  // --- current streak ---
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let d = new Date(today); ; d.setDate(d.getDate() - 1)) {
    const key = d.toISOString().slice(0, 10);
    if (completedDates.has(key)) {
      streak += 1;
    } else {
      break;
    }
  }

  // --- average energy ---
  const avgEnergy = energyCount > 0 ? totalEnergy / energyCount : 0;

  // --- score ---
  const consistencyScore = consistency * 40;
  const streakScore = Math.min(streak / 30, 1) * 25;
  const energyScore = ((avgEnergy - 1) / 9) * 20; // normalise 1–10 → 0–1
  const minutesScore = Math.min(totalMinutes / 3000, 1) * 15;

  const score = Math.round(consistencyScore + streakScore + energyScore + minutesScore);

  return {
    score: Math.min(100, Math.max(0, score)),
    consistency: Math.round(consistency * 100),
    streak,
    avgEnergy: Math.round(avgEnergy * 10) / 10,
    totalMinutes,
  };
}

/**
 * Group checkins into { date, minutes } for charting.
 * Returns the last 14 days.
 */
export function minutesPerDay(checkins) {
  const map = {};

  for (const c of checkins) {
    const day = c.created_at.slice(0, 10);
    map[day] = (map[day] ?? 0) + (c.minutes_worked ?? 0);
  }

  const result = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key.slice(5), minutes: map[key] ?? 0 });
  }

  return result;
}
