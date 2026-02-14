import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ensureProfile = async (userId) => {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (!data) {
      await supabase.from("profiles").insert({
        id: userId,
        username: email.split("@")[0],
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "login") {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) { setError(err.message); setLoading(false); return; }
      await ensureProfile(data.user.id);
    } else {
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      if (err) { setError(err.message); setLoading(false); return; }
      if (data.user) await ensureProfile(data.user.id);
    }

    setLoading(false);
  };

  const isLogin = mode === "login";

  return (
    <div className="auth">
      <h2 className="auth-heading">{isLogin ? "Welcome back" : "Create your account"}</h2>
      <p className="auth-sub">
        {isLogin ? "Log in to continue your streak." : "Start building your future."}
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {error && <p className="auth-error">{error}</p>}

        <button className="btn-commit" type="submit" disabled={loading}>
          {loading ? "..." : isLogin ? "Log in" : "Sign up"}
        </button>
      </form>

      <button
        className="auth-toggle"
        onClick={() => { setMode(isLogin ? "signup" : "login"); setError(null); }}
      >
        {isLogin ? "No account? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  );
}
