import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import MomentumPanel from "../components/MomentumPanel";
import { supabase } from "../supabaseClient";

export default function MomentumPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError(null);

    supabase
      .from("goals")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
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
  }, [user]);

  if (!user) return null;

  return (
    <div className="page-section">
      <div className="dashboard-card-surface">
        <div className="panel-heading">
          <span className="panel-title">Momentum Intelligence</span>
          <span className="panel-sub">Signals</span>
        </div>
        {loading && <div className="panel-placeholder">Calculating your momentum...</div>}
        {error && !loading && (
          <div className="panel-placeholder error">{error}</div>
        )}
        {!loading && !error && goals && goals.length === 0 && (
          <div className="panel-placeholder">Add a goal to unlock momentum analytics.</div>
        )}
        {!loading && !error && goals && goals.length > 0 && (
          <MomentumPanel userId={user.id} goals={goals} />
        )}
      </div>
    </div>
  );
}
