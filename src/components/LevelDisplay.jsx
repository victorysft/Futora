import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import "./LevelDisplay.css";

// Level formula from requirements
const levelFromXP = (xp) => Math.floor(Math.sqrt(xp / 50));
const xpForLevel = (level) => Math.pow(level, 2) * 50;
const xpForNextLevel = (currentLevel) => xpForLevel(currentLevel + 1);

export default function LevelDisplay({ userId, refresh = 0 }) {
  const [profile, setProfile] = useState({ xp: 0, level: 1, total_check_ins: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchProfile = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("xp, level, total_check_ins")
        .eq("id", userId)
        .single();
      
      if (!error && data) {
        // Ensure level is calculated correctly from XP
        const correctLevel = levelFromXP(data.xp || 0);
        setProfile({
          xp: data.xp || 0,
          level: correctLevel,
          total_check_ins: data.total_check_ins || 0,
        });
      }
      setLoading(false);
    };

    fetchProfile();
  }, [userId, refresh]);

  if (loading) {
    return <div className="level-loading">Loading level...</div>;
  }

  const currentXP = profile.xp;
  const currentLevel = profile.level;
  const nextLevel = currentLevel + 1;
  
  // XP needed for current and next level
  const xpCurrentLevel = xpForLevel(currentLevel);
  const xpNextLevel = xpForNextLevel(currentLevel);
  
  // Progress within current level
  const xpInLevel = currentXP - xpCurrentLevel;
  const xpNeeded = xpNextLevel - xpCurrentLevel;
  const progressPercent = Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));

  return (
    <div className="level-display">
      <div className="level-header">
        <div className="level-number">Level {currentLevel}</div>
        <div className="total-checkins">{profile.total_check_ins} check-ins</div>
      </div>
      
      <div className="xp-progress">
        <div className="xp-bar">
          <div 
            className="xp-fill" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="xp-text">
          {xpInLevel} / {xpNeeded} XP
        </div>
      </div>
    </div>
  );
}