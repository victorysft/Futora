import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function TodaysAction({ userId }) {
  const [action, setAction] = useState("");
  const [input, setInput] = useState("");
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const today = getToday();

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("actions")
      .select("action, completed")
      .eq("user_id", userId)
      .eq("date", today)
      .single()
      .then(({ data }) => {
        setAction(data?.action || "");
        setCompleted(!!data?.completed);
        setLoading(false);
      });
  }, [userId, today]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setSaving(true);
    await supabase.from("actions").upsert({
      user_id: userId,
      date: today,
      action: input.trim(),
      completed: false,
    });
    setAction(input.trim());
    setInput("");
    setSaving(false);
  };

  return (
    <div className="todays-action-section">
      <div className="todays-action-label">Today's Action</div>
      {loading ? (
        <div className="todays-action-loading">Loading...</div>
      ) : action ? (
        <div className="todays-action-display">
          <span>{action}</span>
          {completed && <span className="todays-action-check">✔</span>}
        </div>
      ) : (
        <form onSubmit={handleSave} className="todays-action-form">
          <input
            className="todays-action-input"
            type="text"
            placeholder="What will you do today?"
            value={input}
            onChange={e => setInput(e.target.value)}
            maxLength={80}
            disabled={saving}
            autoFocus
          />
          <button className="todays-action-btn" type="submit" disabled={saving || !input.trim()}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}
