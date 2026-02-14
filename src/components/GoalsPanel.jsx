import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const MAX_DISPLAY = 4;

export default function GoalsPanel({ userId }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setError(null);

    supabase
      .from("goals")
      .select("id, title, description, deadline, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(MAX_DISPLAY)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setError(error.message);
          setGoals([]);
        } else {
          setGoals(data || []);
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const renderContent = () => {
    if (loading) {
      return <div className="panel-placeholder">Loading goals...</div>;
    }

    if (error) {
      return <div className="panel-placeholder error">{error}</div>;
    }

    if (!goals.length) {
      return (
        <div className="panel-placeholder">No goals yet. Define the habits that build your identity.</div>
      );
    }

    return (
      <ul className="goals-list-mini">
        {goals.map((goal) => (
          <li key={goal.id} className="goal-pill">
            <div className="goal-pill-main">
              <span className="goal-pill-dot" />
              <span className="goal-pill-title">{goal.title}</span>
            </div>
            {goal.deadline && (
              <span className="goal-pill-deadline">{formatDate(goal.deadline)}</span>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="dashboard-card-surface goals-card">
      <div className="panel-heading">
        <span className="panel-title">Goals</span>
        {goals.length > 0 && (
          <span className="panel-sub">{goals.length} active</span>
        )}
      </div>
      {renderContent()}
    </div>
  );
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch (err) {
    return value;
  }
}
