/** Row shape for the `profiles` table. */
export interface Profile {
  id: string;
  username: string | null;
  identity: string | null;
  xp: number;
  level: number;
  total_check_ins: number;
  created_at: string;
}

/** Row shape for the `goals` table. */
export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  created_at: string;
}

/** Row shape for the `checkins` table. */
export interface CheckIn {
  id: string;
  user_id: string;
  goal_id: string | null;
  minutes_worked: number | null;
  energy_level: number | null;
  completed: boolean;
  created_at: string;
}

// ── XP → Level helpers (keep level logic in the client, not in the DB) ──

const XP_PER_LEVEL = 100;

/** Derive the current level from total XP. */
export function levelFromXP(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/** XP needed to reach the next level. */
export function xpToNextLevel(xp: number): number {
  return XP_PER_LEVEL - (xp % XP_PER_LEVEL);
}

/** Progress percentage toward the next level (0–100). */
export function levelProgress(xp: number): number {
  return Math.round(((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100);
}
