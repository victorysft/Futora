import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import DailyCheckIn from "./DailyCheckIn";
import MomentumPanel from "./MomentumPanel";

export default function GoalManager({ userId }) {
  const [goals, setGoals] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkinsByGoal, setCheckinsByGoal] = useState({});

  const maxReached = goals.length >= 3;

  const fetchGoals = async () => {
    const { data, error: fetchError } = await supabase
      .from("goals")
      .select("id, title, description, deadline, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (fetchError) {
      throw fetchError;
    }

    return data ?? [];
  };

  const fetchTodayCheckins = async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { data, error: fetchError } = await supabase
      .from("checkins")
      .select("id, goal_id, minutes_worked, energy_level, completed, created_at")
      .eq("user_id", userId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    const map = {};
    (data ?? []).forEach((checkin) => {
      map[checkin.goal_id] = checkin;
    });

    return map;
  };

  const fetchData = async () => {
    setLoading(true);
    setError("");

    try {
      const [goalsData, checkinsMap] = await Promise.all([
        fetchGoals(),
        fetchTodayCheckins(),
      ]);

      setGoals(goalsData);
      setCheckinsByGoal(checkinsMap);
    } catch (fetchError) {
      setError(fetchError.message);
      setGoals([]);
      setCheckinsByGoal({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  const canCreate = useMemo(() => title.trim().length > 0 && !maxReached && !submitting, [title, maxReached, submitting]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!canCreate) return;

    setSubmitting(true);
    setError("");

    const payload = {
      user_id: userId,
      title: title.trim(),
      description: description.trim() || null,
      deadline: deadline || null,
    };

    const { error: insertError } = await supabase.from("goals").insert(payload);

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    setTitle("");
    setDescription("");
    setDeadline("");
    await fetchData();
    setSubmitting(false);
  };

  const handleDelete = async (goalId) => {
    setError("");
    const { error: deleteError } = await supabase
      .from("goals")
      .delete()
      .eq("id", goalId)
      .eq("user_id", userId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await fetchData();
  };

  const handleCheckinSaved = (checkin) => {
    setCheckinsByGoal((previous) => ({
      ...previous,
      [checkin.goal_id]: checkin,
    }));
  };

  return (
    <section className="goals">
      <div className="goals-head">
        <h2 className="goals-title">Your Goals</h2>
        <p className="goals-sub">Max 3 goals</p>
      </div>

      <form className="goals-form" onSubmit={handleCreate}>
        <input
          className="input"
          type="text"
          placeholder="Goal title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
        />
        <textarea
          className="input goals-textarea"
          placeholder="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
          rows={3}
        />
        <input
          className="input"
          type="date"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
        />
        <button className="btn-commit" type="submit" disabled={!canCreate}>
          {maxReached ? "Limit reached" : submitting ? "Saving..." : "Add goal"}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {!loading && goals.length > 0 && (
        <MomentumPanel userId={userId} goals={goals} />
      )}

      {loading ? (
        <p className="goals-empty">Loading goals...</p>
      ) : goals.length === 0 ? (
        <p className="goals-empty">No goals yet.</p>
      ) : (
        <ul className="goals-list">
          {goals.map((goal) => (
            <li className="goal-card" key={goal.id}>
              <div className="goal-card-top">
                <div className="goal-copy">
                  <h3 className="goal-card-title">{goal.title}</h3>
                  {goal.description && <p className="goal-card-desc">{goal.description}</p>}
                  <p className="goal-card-deadline">{goal.deadline ? `Deadline: ${goal.deadline}` : "No deadline"}</p>
                </div>
                <button className="btn-reset" onClick={() => handleDelete(goal.id)} type="button">
                  Delete
                </button>
              </div>
              <DailyCheckIn
                userId={userId}
                goalId={goal.id}
                existingCheckin={checkinsByGoal[goal.id]}
                onSaved={handleCheckinSaved}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}