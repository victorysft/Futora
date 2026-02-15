import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Signup() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    const { data, error: signUpError } = await signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    if (data.session) {
      navigate("/dashboard", { replace: true });
      return;
    }

    setMessage("Account created. Check your email confirmation, then login.");
    setSubmitting(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <h1 className="auth-hero-title">FUTORA</h1>
        <p className="auth-hero-subtitle">Your future is built by what you do today.</p>
      </div>

      <section className="auth-card">
        <h2 className="auth-title">Sign up</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />
          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-info">{message}</p>}
          <button className="auth-button" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Sign up"}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </section>
    </div>
  );
}
