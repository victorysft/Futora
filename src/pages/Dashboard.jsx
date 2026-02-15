import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import LevelUpOverlay from "../components/LevelUpOverlay";
import "./Dashboard.css";
import { supabase } from "../supabaseClient";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDisplayDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const levelFromXP = (xp) => Math.floor(Math.sqrt(xp / 50));
const xpForLevel = (level) => Math.pow(level, 2) * 50;

export default function Dashboard() {
  const { user } = useAuth();
  const [identity, setIdentity] = useState("");
  const [streak, setStreak] = useState(0);
  const [lastCheckIn, setLastCheckIn] = useState(null);
  const [checking, setChecking] = useState(false);
  const [levelUpLevel, setLevelUpLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [xp, setXp] = useState(0);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [weeklyCheckIns, setWeeklyCheckIns] = useState(0);
  const [goals, setGoals] = useState([]);

  const checkedInToday = lastCheckIn === getToday();
  const currentLevel = levelFromXP(xp);
  const xpCurrent = xp - xpForLevel(currentLevel);
  const xpNeeded = xpForLevel(currentLevel + 1) - xpForLevel(currentLevel);
  const xpPercent = xpNeeded > 0 ? Math.min(100, (xpCurrent / xpNeeded) * 100) : 0;

  useEffect(() => {
    if (!user) return;

    const fetchAll = async () => {
      // Profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("identity, last_check_in, xp, level, total_check_ins")
        .eq("id", user.id)
        .single();

      if (profile) {
        setIdentity(profile.identity || "");
        setLastCheckIn(profile.last_check_in);
        setXp(profile.xp || 0);
        setTotalCheckIns(profile.total_check_ins || 0);
      }

      // Goals (silently hide if table missing)
      try {
        const { data: goalsData } = await supabase
          .from("goals")
          .select("id, title, deadline")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(4);
        setGoals(goalsData || []);
      } catch {
        setGoals([]);
      }

      // Checkins for streaks
      const { data: recentCheckins } = await supabase
        .from("checkins")
        .select("created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(365);

      if (recentCheckins) {
        const dates = new Set();
        recentCheckins.forEach((c) => dates.add(c.created_at.slice(0, 10)));

        // Current streak
        const today = new Date();
        let currentStreak = 0;
        for (let i = 0; i < 365; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          if (dates.has(d.toISOString().slice(0, 10))) {
            currentStreak++;
          } else {
            break;
          }
        }
        setStreak(currentStreak);

        // Longest streak
        const sortedDates = [...dates].sort();
        let longest = 0;
        let run = 0;
        let prev = null;
        for (const dateStr of sortedDates) {
          if (!prev) {
            run = 1;
          } else {
            const a = new Date(prev);
            const b = new Date(dateStr);
            const diff = (b - a) / 86400000;
            run = diff === 1 ? run + 1 : 1;
          }
          if (run > longest) longest = run;
          prev = dateStr;
        }
        setLongestStreak(longest);

        // Weekly check-ins
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 6);
        weekAgo.setHours(0, 0, 0, 0);
        let weekly = 0;
        dates.forEach((d) => {
          if (new Date(d) >= weekAgo) weekly++;
        });
        setWeeklyCheckIns(weekly);
      }

      setLoading(false);
    };

    fetchAll();
  }, [user]);

  const handleCheckIn = async () => {
    if (checking || checkedInToday) return;

    setChecking(true);

    try {
      await supabase.from("checkins").insert({
        user_id: user.id,
        goal_id: null,
        minutes_worked: 30,
        energy_level: 8,
        completed: true,
      });

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("xp, level, total_check_ins")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      const previousXP = profile?.xp || 0;
      const previousLevel = Math.floor(Math.sqrt(previousXP / 50));

      const { data: recentCheckins, error: checkinsError } = await supabase
        .from("checkins")
        .select("created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(365);

      let newStreak = 0;
      if (!checkinsError && recentCheckins) {
        const dates = new Set();
        recentCheckins.forEach((c) => dates.add(c.created_at.slice(0, 10)));

        const now = new Date();
        for (let i = 0; i < 365; i++) {
          const d = new Date(now);
          d.setDate(now.getDate() - i);
          if (dates.has(d.toISOString().slice(0, 10))) {
            newStreak++;
          } else {
            break;
          }
        }
      }

      const baseXP = 10;
      let bonusXP = 0;
      if (newStreak === 365) bonusXP = 1000;
      else if (newStreak === 90) bonusXP = 300;
      else if (newStreak === 30) bonusXP = 100;
      else if (newStreak === 7) bonusXP = 20;

      const xpGain = baseXP + bonusXP;
      const newXP = previousXP + xpGain;
      const newLevel = Math.floor(Math.sqrt(newXP / 50));
      const didLevelUp = newLevel > previousLevel;
      const newTotalCheckIns = (profile?.total_check_ins || 0) + 1;
      const today = getToday();

      await supabase
        .from("profiles")
        .update({
          xp: newXP,
          level: newLevel,
          total_check_ins: newTotalCheckIns,
          last_check_in: today,
        })
        .eq("id", user.id);

      if (didLevelUp) setLevelUpLevel(newLevel);

      setStreak(newStreak);
      setLastCheckIn(today);
      setXp(newXP);
      setTotalCheckIns(newTotalCheckIns);
      setChecking(false);
    } catch (err) {
      console.error("Check-in failed:", err);
      setChecking(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleStartOver = async () => {
    if (!window.confirm("Are you sure you want to reset your streak?")) return;

    await supabase
      .from("profiles")
      .update({ last_check_in: null })
      .eq("id", user.id);

    setLastCheckIn(null);
    setStreak(0);
  };

  if (loading) {
    return <div className="db-loading">Loading...</div>;
  }

  return (
    <>
      <LevelUpOverlay
        level={levelUpLevel || 1}
        isVisible={levelUpLevel !== null}
        onComplete={() => setLevelUpLevel(null)}
      />

      <div className="db-page">
        {/* Top bar */}
        <header className="db-topbar">
          <div>
            <h1 className="db-greeting">{getGreeting()}, {user?.email?.split("@")[0]}</h1>
          </div>
          <span className="db-date">{formatDisplayDate()}</span>
        </header>

        {/* Main grid */}
        <div className="db-grid">
          {/* Identity card */}
          <div className="db-card db-identity-card">
            <div className="db-card-header">
              <span className="db-card-label">WHO I AM BECOMING</span>
            </div>
            <div className="db-identity-box">
              <p className="db-identity-text">{identity || "Define your identity..."}</p>
              <svg className="db-edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.5 6.5l5 5M3 21l2.5-7.5L17 2.5a2.121 2.121 0 013 3L8.5 17.5 3 21z"/>
              </svg>
            </div>
          </div>

          {/* Level card */}
          <div className="db-card db-level-card">
            <div className="db-card-header">
              <span className="db-card-label">LEVEL</span>
              <span className="db-card-sub">{totalCheckIns} check-ins</span>
            </div>
            <div className="db-level-number">Level {currentLevel}</div>
            <div className="db-xp-bar-track">
              <div className="db-xp-bar-fill" style={{ width: `${xpPercent}%` }} />
            </div>
            <div className="db-xp-text">{xpCurrent} / {xpNeeded} XP</div>
          </div>

          {/* Goals card */}
          {goals.length > 0 && (
            <div className="db-card db-goals-card">
              <div className="db-card-header">
                <span className="db-card-label">GOALS</span>
                <span className="db-card-sub">{goals.length} active</span>
              </div>
              <ul className="db-goals-list">
                {goals.map((g) => (
                  <li key={g.id} className="db-goal-item">
                    <span className="db-goal-dot" />
                    <span className="db-goal-title">{g.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Momentum card */}
          <div className="db-card db-momentum-card">
            <div className="db-card-header">
              <span className="db-card-label">MOMENTUM</span>
            </div>
            <div className="db-momentum-stats">
              <div className="db-mstat">
                <span className="db-mstat-value">{totalCheckIns}</span>
                <span className="db-mstat-label">Total check-ins</span>
              </div>
              <div className="db-mstat">
                <span className="db-mstat-value">{longestStreak}</span>
                <span className="db-mstat-label">Longest streak</span>
              </div>
              <div className="db-mstat">
                <span className="db-mstat-value">{weeklyCheckIns}</span>
                <span className="db-mstat-label">This week</span>
              </div>
            </div>
          </div>
        </div>

        {/* Streak + check-in section */}
        <div className="db-checkin-section">
          <div className="db-card db-checkin-card">
            <div className="db-card-header">
              <span className="db-card-label">DAILY CHECK-IN</span>
            </div>

            <div className="db-streak-row">
              <div className="db-streak-block">
                <span className="db-streak-value">{streak}</span>
                <span className="db-streak-label">day streak</span>
              </div>
              {lastCheckIn && (
                <div className="db-streak-block">
                  <span className="db-streak-date">{lastCheckIn}</span>
                  <span className="db-streak-label">last check-in</span>
                </div>
              )}
            </div>

            <button
              className="db-checkin-btn"
              onClick={handleCheckIn}
              disabled={checking || checkedInToday}
            >
              {checking
                ? "Recording..."
                : checkedInToday
                  ? "✓ Logged. Keep going."
                  : "I became that person today"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="db-footer">
          <button className="db-footer-link" onClick={handleStartOver}>Start over</button>
          <span className="db-footer-dot">•</span>
          <button className="db-footer-link" onClick={handleSignOut}>Sign out</button>
        </footer>
      </div>
    </>
  );
}
