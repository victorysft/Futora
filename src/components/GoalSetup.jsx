import { useState } from "react";

export default function GoalSetup({ onCommit }) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onCommit(trimmed);
  };

  return (
    <div className="setup">
      <h2 className="setup-heading">Who are you becoming?</h2>
      <p className="setup-sub">One identity. No backup plan.</p>
      <input
        className="input"
        type="text"
        placeholder="I am becoming..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus
      />
      <button
        className="btn-commit"
        onClick={submit}
        disabled={!value.trim()}
      >
        Commit
      </button>
    </div>
  );
}
