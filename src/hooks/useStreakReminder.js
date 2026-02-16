import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useStreakReminder — Smart streak notifications.
 *
 * - Detect if user missed yesterday
 * - Detect if streak is at risk (late in the day, no check-in yet)
 * - Detect streak milestones (7, 14, 30, 60, 100, 365 days)
 *
 * Returns: { missedYesterday, streakAtRisk, isCheckedInToday, streakMilestone, loading }
 */
export function useStreakReminder(userId) {
  const [missedYesterday, setMissedYesterday] = useState(false);
  const [streakAtRisk, setStreakAtRisk] = useState(false);
  const [isCheckedInToday, setIsCheckedInToday] = useState(false);
  const [streakMilestone, setStreakMilestone] = useState(null);
  const [loading, setLoading] = useState(true);

  const MILESTONES = [7, 14, 30, 60, 100, 200, 365];

  const check = useCallback(async () => {
    if (!userId) return;
    try {
      // Fetch user's profile for streak and last_check_in
      const { data: profile } = await supabase
        .from("profiles")
        .select("streak, last_check_in")
        .eq("id", userId)
        .single();

      if (!profile) return;

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const lastCheckIn = profile.last_check_in
        ? new Date(profile.last_check_in)
        : null;

      // Is checked in today?
      const checkedToday = lastCheckIn && lastCheckIn >= todayStart;
      setIsCheckedInToday(checkedToday);

      // Missed yesterday? (last check-in was 2+ days ago)
      if (lastCheckIn) {
        const yesterday = new Date(todayStart);
        yesterday.setDate(yesterday.getDate() - 1);
        const dayBefore = new Date(todayStart);
        dayBefore.setDate(dayBefore.getDate() - 2);

        // Missed if last check-in was before yesterday
        setMissedYesterday(lastCheckIn < yesterday);
      } else {
        setMissedYesterday(false);
      }

      // Streak at risk? (after 6 PM local time, not checked in today)
      const hour = now.getHours();
      setStreakAtRisk(!checkedToday && hour >= 18 && profile.streak > 0);

      // Streak milestone?
      const streak = profile.streak || 0;
      const milestone = MILESTONES.find((m) => m === streak);
      setStreakMilestone(milestone || null);
    } catch (err) {
      console.error("[useStreakReminder] error:", err);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    check().finally(() => setLoading(false));

    // Check every 5 minutes
    const interval = setInterval(check, 5 * 60_000);

    // Also check when profile updates
    const channel = supabase
      .channel("streak-reminder-" + userId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        () => check()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [userId, check]);

  return { missedYesterday, streakAtRisk, isCheckedInToday, streakMilestone, loading };
}
