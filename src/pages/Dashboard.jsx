
import { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import IdentityCard from "../components/IdentityCard";
import LevelDisplay from "../components/LevelDisplay";
import ProgressPanel from "../components/ProgressPanel";
import GoalsPanel from "../components/GoalsPanel";
import DailyCheckInCard from "../components/DailyCheckInCard";
import TodaysAction from "../components/TodaysAction";
import LevelUpOverlay from "../components/LevelUpOverlay";
import "../components/TodaysAction.css";
import "../components/LevelDisplay.css";
import "./Dashboard.css";
import { supabase } from "../supabaseClient";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [refreshStats, setRefreshStats] = useState(0);
  const [levelUpLevel, setLevelUpLevel] = useState(null);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleCheckIn = async () => {
    if (checking) return;
    
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

      let streak = 0;
      if (!checkinsError && recentCheckins) {
        const dates = new Set();
        recentCheckins.forEach(checkin => {
          dates.add(checkin.created_at.slice(0, 10));
        });

        const today = new Date();
        for (let i = 0; i < 365; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(today.getDate() - i);
          const dateStr = checkDate.toISOString().slice(0, 10);
          if (dates.has(dateStr)) {
            streak++;
          } else {
            break;
          }
        }
      }

      const baseXP = 10;
      let bonusXP = 0;
      if (streak === 365) bonusXP = 1000;
      else if (streak === 90) bonusXP = 300;
      else if (streak === 30) bonusXP = 100;
      else if (streak === 7) bonusXP = 20;

      const xpGain = baseXP + bonusXP;
      const newXP = previousXP + xpGain;
      const newLevel = Math.floor(Math.sqrt(newXP / 50));
      const didLevelUp = newLevel > previousLevel;
      const newTotalCheckIns = (profile?.total_check_ins || 0) + 1;

      await supabase
        .from("profiles")
        .update({
          xp: newXP,
          level: newLevel,
          total_check_ins: newTotalCheckIns,
        })
        .eq("id", user.id);

      if (didLevelUp) {
        setLevelUpLevel(newLevel);
      }

      setTimeout(() => {
        setChecking(false);
        setShowConfirmation(true);
        setRefreshStats(prev => prev + 1);
        
        setTimeout(() => {
          setShowConfirmation(false);
        }, 2000);
      }, 600);

      return {
        xp: newXP,
        level: newLevel,
        didLevelUp,
      };

    } catch (error) {
      console.error("Check-in failed:", error);
      setChecking(false);
    }
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <>
      <LevelUpOverlay
        level={levelUpLevel || 1}
        isVisible={levelUpLevel !== null}
        onComplete={() => setLevelUpLevel(null)}
      />

      <div className="dashboard-wrapper">
        <div className="dashboard-greeting">
          <h1>{greeting}, {user?.email?.split("@")[0] ?? "creator"}</h1>
          <span>{new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" })}</span>
        </div>

        <div className="dashboard-grid">
          <div className="dashboard-area dash-identity">
            <IdentityCard userId={user?.id} />
          </div>
          <div className="dashboard-area dash-level">
            <LevelDisplay userId={user?.id} refresh={refreshStats} />
          </div>
          <div className="dashboard-area dash-goals">
            <GoalsPanel userId={user?.id} />
          </div>
          <div className="dashboard-area dash-momentum">
            <div className="dashboard-card-surface">
              <div className="panel-heading">
                <span className="panel-title">Momentum</span>
                <span className="panel-sub">consistency</span>
              </div>
              <ProgressPanel userId={user?.id} refresh={refreshStats} />
            </div>
          </div>
          <div className="dashboard-area dash-checkin">
            <DailyCheckInCard
              checking={checking}
              onCheckIn={handleCheckIn}
              showConfirmation={showConfirmation}
              onSignOut={handleSignOut}
            />
          </div>
          <div className="dashboard-area dash-action">
            <div className="dashboard-card-surface">
              <TodaysAction userId={user?.id} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
