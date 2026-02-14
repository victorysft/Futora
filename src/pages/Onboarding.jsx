
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Onboarding() {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchIdentity = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("identity_text")
        .eq("id", user.id)
        .single();
      if (error) setError(error.message);
      else setIdentity(data?.identity_text || "");
      setLoading(false);
    };
    fetchIdentity();
    // eslint-disable-next-line
  }, []);

  const handleCommit = async () => {
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ identity_text: identity })
      .eq("id", user.id);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    // Redirect to /app and prevent back navigation
    navigate("/app", { replace: true });
  };

  return (
    <main className="page-shell">
      <div style={{ maxWidth: 520, margin: "0 auto", paddingTop: "2.5rem" }}>
        <h1 className="onboarding-title" style={{ textAlign: "center", marginBottom: "2.2rem" }}>
          Wie ben jij aan het worden?
        </h1>
        <textarea
          className="identity-textarea"
          value={identity}
          onChange={e => setIdentity(e.target.value)}
          placeholder="Dit is wie ik aan het worden ben..."
          rows={5}
          disabled={loading || saving}
          style={{ width: '100%', marginBottom: 24 }}
        />
        <button
          className="auth-button"
          style={{ width: '100%', fontWeight: 600, fontSize: '1.1rem', padding: '0.9rem 0', borderRadius: 12 }}
          onClick={handleCommit}
          disabled={saving || loading || !identity.trim()}
        >
          {saving ? 'Opslaan...' : 'COMMIT'}
        </button>
        {error && <div className="auth-error" style={{ marginTop: 24 }}>{error}</div>}
      </div>
    </main>
  );
}
