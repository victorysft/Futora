import { supabase } from "../supabaseClient";

// Fetch all checkins for a user (optionally for a goal)
export async function fetchCheckins(userId, goalId = null) {
  let query = supabase
    .from("checkins")
    .select("id, goal_id, completed, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (goalId) query = query.eq("goal_id", goalId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Calculate stats from checkins
export function calcProgressStats(checkins) {
  // Only count completed checkins
  const completed = checkins.filter(c => c.completed);
  const total = completed.length;

  // Longest streak
  let longest = 0, current = 0;
  let prevDate = null;
  for (const c of completed) {
    const date = c.created_at.slice(0, 10);
    if (!prevDate) {
      current = 1;
    } else {
      const prev = new Date(prevDate);
      const curr = new Date(date);
      const diff = (curr - prev) / 86400000;
      if (diff === 1) {
        current += 1;
      } else if (diff === 0) {
        // same day, ignore
      } else {
        current = 1;
      }
    }
    if (current > longest) longest = current;
    prevDate = date;
  }

  // Weekly check-ins (last 7 days)
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  const weekly = completed.filter(c => {
    const d = new Date(c.created_at.slice(0, 10));
    return d >= weekAgo && d <= now;
  }).length;

  return {
    total,
    longest,
    weekly,
  };
}
