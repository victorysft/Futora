import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../supabaseClient";
import "./Login.css";

/* ── Login Page ── */
export default function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: signInError } = await signIn({ email, password });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    navigate("/dashboard", { replace: true });
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/dashboard" },
    });
  };

  const handleApple = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: window.location.origin + "/dashboard" },
    });
  };

  return (
    <div className="login-page">
      {/* Background Video */}
      <video
        className="background-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/video-poster.jpg"
      >
        <source src="/background-video.mp4" type="video/mp4" />
      </video>

      {/* Dark Overlay */}
      <div className="video-overlay"></div>

      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Label */}
        <p className="login-label">ACCESS PORTAL</p>

        {/* Brand */}
        <h1 className="login-logo">FUTORA</h1>

        {/* Subtext */}
        <p className="login-subtext">For authorized operators only.</p>

        {/* Auth */}
        <div className="login-auth">
          {/* Apple */}
          <button
            type="button"
            className="login-apple-btn"
            onClick={handleApple}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            <span>Continue with Apple</span>
          </button>

          {/* Google */}
          <button
            type="button"
            className="login-google-btn"
            onClick={handleGoogle}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="rgba(255,255,255,0.7)" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="rgba(255,255,255,0.7)" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="rgba(255,255,255,0.7)" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.003 24.003 0 000 21.56l7.98-6.19z"/>
              <path fill="rgba(255,255,255,0.7)" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="login-divider">
            <span className="login-divider-line" />
            <span className="login-divider-text">or</span>
            <span className="login-divider-line" />
          </div>

          {/* Form */}
          <form className="login-form" onSubmit={handleSubmit}>
            <input
              className="login-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <div className="password-wrapper">
              <input
                className="login-input"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            {error && <p className="login-error">{error}</p>}
            <button
              className="login-cta-btn"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "PROCESSING..." : "PROCEED"}
            </button>
          </form>

          <p className="login-switch">
            No account? <Link to="/signup">Create account</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
