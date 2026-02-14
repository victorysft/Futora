import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../supabaseClient";

export default function Onboarding() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const [identity, setIdentity] = useState(profile?.identity ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    setIdentity(profile?.identity ?? "");
  }, [profile?.identity]);

  const handleCommit = async () => {
    if (!user) {
      setError("Not authenticated");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const trimmedIdentity = identity.trim();

      if (!profile) {
        const { error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            identity: trimmedIdentity,
            xp: 0,
            level: 1,
            streak: 0,
            last_check_in: null,
          });

        if (insertError) {
          throw insertError;
        }
      } else {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ identity: trimmedIdentity })
          .eq("id", user.id);

        if (updateError) {
          throw updateError;
        }
      }

      await refreshProfile();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Kon identiteit niet opslaan.");
    } finally {
      setSaving(false);
    }
  };

  const isBusy = saving || loading;

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
          disabled={isBusy}
          style={{ width: "100%", marginBottom: 24 }}
        />
        <button
          className="auth-button"
          style={{ width: "100%", fontWeight: 600, fontSize: "1.1rem", padding: "0.9rem 0", borderRadius: 12 }}
          onClick={handleCommit}
          disabled={isBusy || !identity.trim()}
        >
          {saving ? "Opslaan..." : "COMMIT"}
        </button>
        {error && <div className="auth-error" style={{ marginTop: 24 }}>{error}</div>}
      </div>
    </main>
  );
}
