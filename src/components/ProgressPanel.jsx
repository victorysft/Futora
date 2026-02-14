import { useEffect, useState } from "react";
import { fetchCheckins, calcProgressStats } from "../utils/progress";

export default function ProgressPanel({ userId, refresh = 0 }) {
  const [stats, setStats] = useState({ total: 0, longest: 0, weekly: 0 });
  const [loading, setLoading] = useState(true);
  const [statsChanged, setStatsChanged] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchCheckins(userId)
      .then((checkins) => {
        if (mounted) {
          const newStats = calcProgressStats(checkins);
          setStats(prevStats => {
            // Check if stats changed to trigger animation
            const changed = prevStats.total !== newStats.total || 
                           prevStats.longest !== newStats.longest || 
                           prevStats.weekly !== newStats.weekly;
            if (changed && refresh > 0) setStatsChanged(true);
            return newStats;
          });
        }
      })
      .finally(() => mounted && setLoading(false));
    
    return () => { mounted = false; };
  }, [userId, refresh]);

  useEffect(() => {
    if (statsChanged) {
      const timer = setTimeout(() => setStatsChanged(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [statsChanged]);

  return (
    <div className="progress-panel">
      <div className="progress-row">
        <StatBox label="Total Check-ins" value={loading ? "-" : stats.total} animate={statsChanged} />
        <StatBox label="Longest Streak" value={loading ? "-" : stats.longest} animate={statsChanged} />
        <StatBox label="Weekly Check-ins" value={loading ? "-" : stats.weekly} animate={statsChanged} />
      </div>
    </div>
  );
}

function StatBox({ label, value, animate = false }) {
  return (
    <div className={`progress-stat ${animate ? 'animate' : ''}`}>
      <div className="progress-value">{value}</div>
      <div className="progress-label">{label}</div>
    </div>
  );
}
