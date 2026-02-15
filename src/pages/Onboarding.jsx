import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { useOnboarding } from "../context/OnboardingContext";
import { supabase } from "../supabaseClient";
import "./Login.css";
import "./Onboarding.css";

const FOCUS_OPTIONS = [
  "Entrepreneur",
  "Athlete",
  "Creator",
  "Developer",
  "Student",
  "Other",
];

const COMMITMENT_OPTIONS = ["30 minutes", "1 hour", "2+ hours"];

const TOTAL_DOTS = 6; // 5 steps + confirm

/* Step slug → numeric index for indicator dots */
const STEP_INDEX = {
  "step-1": 1,
  "step-2": 2,
  "step-3": 3,
  "step-4": 4,
  "step-5": 5,
  "confirm": 6,
};

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { step } = useParams(); // "step-1" | "step-2" | … | "confirm"
  const { data, update } = useOnboarding();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const currentIndex = STEP_INDEX[step] || 1;

  /* ── Validation per step ── */
  const canProceed = () => {
    switch (step) {
      case "step-1": return data.becoming.trim().length > 0;
      case "step-2": return data.focus.length > 0;
      case "step-3": return data.commitment.length > 0;
      case "step-4": return data.age !== "" && Number(data.age) > 0;
      case "step-5": return data.location.trim().length > 0;
      default: return false;
    }
  };

  /* ── Navigation ── */
  const ROUTES = [
    "/onboarding/step-1",
    "/onboarding/step-2",
    "/onboarding/step-3",
    "/onboarding/step-4",
    "/onboarding/step-5",
    "/onboarding/confirm",
  ];

  const nextRoute = () => {
    const idx = ROUTES.indexOf(`/onboarding/${step}`);
    if (idx >= 0 && idx < ROUTES.length - 1) {
      navigate(ROUTES[idx + 1]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && canProceed()) {
      e.preventDefault();
      nextRoute();
    }
  };

  /* ── Submit on confirm ── */
  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    setError("");

    try {
      const today = new Date().toISOString().split("T")[0];

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          becoming: data.becoming.trim(),
          focus: data.focus,
          commitment_level: data.commitment,
          age: Number(data.age),
          location: data.location.trim(),
          identity: data.becoming.trim(),
          streak: 1,
          streak_start_date: today,
          profile_completed: true,
        });

      if (upsertError) throw upsertError;

      await refreshProfile();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to save profile.");
      setSubmitting(false);
    }
  };

  /* ── Step content ── */
  const renderStepContent = () => {
    switch (step) {
      case "step-1":
        return (
          <div className="onboarding-step">
            <p className="login-label">STEP 1</p>
            <h2 className="onboarding-question">Who are you becoming?</h2>
            <input
              className="login-input"
              type="text"
              placeholder="I am becoming..."
              value={data.becoming}
              onChange={(e) => update("becoming", e.target.value)}
              onKeyDown={handleKeyDown}
              required
              autoFocus
            />
          </div>
        );

      case "step-2":
        return (
          <div className="onboarding-step">
            <p className="login-label">STEP 2</p>
            <h2 className="onboarding-question">What is your main focus?</h2>
            <div className="onboarding-options">
              {FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`onboarding-option${data.focus === opt ? " selected" : ""}`}
                  onClick={() => update("focus", opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );

      case "step-3":
        return (
          <div className="onboarding-step">
            <p className="login-label">STEP 3</p>
            <h2 className="onboarding-question">How many hours per day will you commit?</h2>
            <div className="onboarding-options">
              {COMMITMENT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`onboarding-option${data.commitment === opt ? " selected" : ""}`}
                  onClick={() => update("commitment", opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );

      case "step-4":
        return (
          <div className="onboarding-step">
            <p className="login-label">STEP 4</p>
            <h2 className="onboarding-question">How old are you?</h2>
            <input
              className="login-input"
              type="number"
              placeholder="Age"
              value={data.age}
              onChange={(e) => update("age", e.target.value)}
              onKeyDown={handleKeyDown}
              required
              min={1}
              max={99}
              autoFocus
            />
          </div>
        );

      case "step-5":
        return (
          <div className="onboarding-step">
            <p className="login-label">STEP 5</p>
            <h2 className="onboarding-question">Where are you from?</h2>
            <input
              className="login-input"
              type="text"
              placeholder="City, Country"
              value={data.location}
              onChange={(e) => update("location", e.target.value)}
              onKeyDown={handleKeyDown}
              required
              autoFocus
            />
          </div>
        );

      case "confirm":
        return (
          <div className="onboarding-step">
            <p className="login-label">READY</p>
            <h2 className="onboarding-question">Your journey starts now.</h2>
            <p className="login-subtext" style={{ marginBottom: "0.5rem" }}>
              If not you, then who.
            </p>
            {error && <p className="login-error">{error}</p>}
            <button
              className="login-cta-btn onboarding-final-btn"
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "CREATING..." : "CREATE PROFILE & START STREAK"}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const showBack = currentIndex > 1;
  const showContinue = step !== "confirm";

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
        {/* Brand */}
        <h1 className="login-logo">FUTORA</h1>

        {/* Step indicator */}
        <div className="onboarding-indicator">
          {Array.from({ length: TOTAL_DOTS }, (_, i) => (
            <span
              key={i}
              className={`onboarding-dot${i + 1 === currentIndex ? " active" : ""}${i + 1 < currentIndex ? " completed" : ""}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="onboarding-content">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="onboarding-nav">
          {showBack && (
            <button
              type="button"
              className="onboarding-back-btn"
              onClick={() => navigate(-1)}
            >
              BACK
            </button>
          )}
          {showContinue && (
            <button
              type="button"
              className="onboarding-next-btn"
              onClick={nextRoute}
              disabled={!canProceed()}
            >
              CONTINUE
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
