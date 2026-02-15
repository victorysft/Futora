import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import "./Login.css";

/* ── Signup Page ── */
export default function Signup() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    // Validate password match
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Validate password length
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);

    const { data, error: signUpError } = await signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    // If session exists, redirect to dashboard
    if (data?.session) {
      navigate("/dashboard", { replace: true });
    } else {
      // If email confirmation is required
      setError("Check your email to confirm your account, then login.");
      setSubmitting(false);
    }
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
        <p className="login-label">CREATE ACCOUNT</p>

        {/* Brand */}
        <h1 className="login-logo">FUTORA</h1>

        {/* Subtext */}
        <p className="login-subtext">Build your future. Start today.</p>

        {/* Form */}
        <div className="login-auth">
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
            <div className="password-wrapper">
              <input
                className="login-input"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label="Toggle confirm password visibility"
              >
                {showConfirmPassword ? (
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
              {submitting ? "CREATING..." : "CREATE ACCOUNT"}
            </button>
          </form>

          <p className="login-switch">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
