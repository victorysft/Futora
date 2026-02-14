import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import LevelUpOverlay from "../components/LevelUpOverlay";
import "./Dashboard.css";
import { supabase } from "../supabaseClient";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { user } = useAuth();
  const [identity, setIdentity] = useState("");
  const [streak, setStreak] = useState(0);
  const [lastCheckIn, setLastCheckIn] = useState(null);
  const [checking, setChecking] = useState(false);
  const [levelUpLevel, setLevelUpLevel] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkedInToday = lastCheckIn === getToday();

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("identity, last_check_in")
        .eq("id", user.id)
        .single();

      if (profile) {
        setIdentity(profile.identity || "");
        setLastCheckIn(profile.last_check_in);
      }

      const { data: recentCheckins } = await supabase
        .from("checkins")
        .select("created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(365);

      if (recentCheckins) {
        const dates = new Set();
        recentCheckins.forEach((c) => dates.add(c.created_at.slice(0, 10)));

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
      }

      setLoading(false);
    };

    fetchProfile();
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
    return <div className="dashboard-loading">Loading...</div>;
  }

  return (
    <>
      <LevelUpOverlay
        level={levelUpLevel || 1}
        isVisible={levelUpLevel !== null}
        onComplete={() => setLevelUpLevel(null)}
      />

      <div className="dashboard-container">
        <header className="dashboard-header">
          <h1 className="dashboard-title">FUTORA</h1>
          <p className="dashboard-subtitle">
            Your future is built by what you do today.
          </p>
        </header>

        <section className="dashboard-mission">
          <h2 className="mission-label">YOUR MISSION</h2>
          <p className="mission-text">
            {identity || "Define your mission..."}
          </p>
        </section>

        <section className="dashboard-stats">
          <div className="stat-item">
            <span className="stat-value">{streak}</span>
            <span className="stat-label">day streak</span>
          </div>
          {lastCheckIn && (
            <div className="stat-item">
              <span className="stat-label">Last check-in: {lastCheckIn}</span>
            </div>
          )}
        </section>

        <button
          className="dashboard-checkin-button"
          onClick={handleCheckIn}
          disabled={checking || checkedInToday}
        >
          {checking
            ? "Recording..."
            : checkedInToday
              ? "✓ Logged. Keep going."
              : "I became that person today"}
        </button>

        <footer className="dashboard-footer">
          <button className="footer-link" onClick={handleStartOver}>
            Start over
          </button>
          <span className="footer-divider">•</span>
          <button className="footer-link" onClick={handleSignOut}>
            Sign out
          </button>
        </footer>
      </div>
    </>
  );
}
