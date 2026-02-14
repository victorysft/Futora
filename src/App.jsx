
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { supabase } from "./supabaseClient";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import "./App.css";

function App() {
  const { user, loading } = useAuth();
  const [identity, setIdentity] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch profile (identity_text) on load or when user changes
  useEffect(() => {
    if (!user) {
      setIdentity(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("identity_text")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        setIdentity(data?.identity_text || "");
        setProfileLoading(false);
      });
  }, [user]);

  // Redirect logic for root
  function RootRedirect() {
    if (loading || profileLoading) return <div className="auth-info">Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (!identity || identity.trim() === "") return <Navigate to="/onboarding" replace />;
    return <Navigate to="/app" replace />;
  }

  // Route guard for /app
  function AppGuard({ children }) {
    if (loading || profileLoading) return <div className="auth-info">Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (!identity || identity.trim() === "") return <Navigate to="/onboarding" replace />;
    return children;
  }

  // Route guard for /onboarding
  function OnboardingGuard({ children }) {
    if (loading || profileLoading) return <div className="auth-info">Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (identity && identity.trim() !== "") return <Navigate to="/app" replace />;
    return children;
  }

  return (
    <main className="page-shell">
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/onboarding" element={<OnboardingGuard><Onboarding /></OnboardingGuard>} />
        <Route path="/app" element={<AppGuard><Dashboard /></AppGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}

export default App;
