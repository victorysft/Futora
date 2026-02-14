import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { supabase } from "../supabaseClient";
import { calculateMomentum, minutesPerDay } from "../utils/momentum";

export default function MomentumPanel({ userId, goals }) {
  const [metrics, setMetrics] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!goals || goals.length === 0) {
      setMetrics(null);
      setChartData([]);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("checkins")
        .select("id, goal_id, minutes_worked, energy_level, completed, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        setLoading(false);
        return;
      }

      const checkins = data ?? [];

      // Use earliest goal created_at as the start date
      const earliest = goals.reduce(
        (min, g) => (g.created_at < min ? g.created_at : min),
        goals[0].created_at
      );

      setMetrics(calculateMomentum(checkins, earliest));
      setChartData(minutesPerDay(checkins));
      setLoading(false);
    };

    fetch();
  }, [userId, goals]);

  if (loading) return <p className="goals-empty">Calculating momentum...</p>;
  if (!metrics) return null;

  return (
    <section className="momentum">
      <h2 className="momentum-heading">Momentum</h2>

      <div className="momentum-score">
        <span className="momentum-value">{metrics.score}</span>
        <span className="momentum-max">/ 100</span>
      </div>

      <div className="momentum-stats">
        <div className="momentum-stat">
          <span className="momentum-stat-value">{metrics.streak}</span>
          <span className="momentum-stat-label">day streak</span>
        </div>
        <div className="momentum-stat">
          <span className="momentum-stat-value">{metrics.totalMinutes}</span>
          <span className="momentum-stat-label">total min</span>
        </div>
        <div className="momentum-stat">
          <span className="momentum-stat-value">{metrics.consistency}%</span>
          <span className="momentum-stat-label">consistency</span>
        </div>
        <div className="momentum-stat">
          <span className="momentum-stat-value">{metrics.avgEnergy}</span>
          <span className="momentum-stat-label">avg energy</span>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="momentum-chart">
          <p className="momentum-chart-label">Minutes per day (last 14 days)</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a1a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#fff",
                }}
              />
              <Line
                type="monotone"
                dataKey="minutes"
                stroke="#fff"
                strokeWidth={2}
                dot={{ r: 3, fill: "#fff" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
