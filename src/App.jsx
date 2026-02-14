import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import "./App.css";

function App() {
  const { user, loading, profile, profileLoading } = useAuth();
  const profileIdentity = profile?.identity ?? "";
  const hasProfile = Boolean(profile);
  const hasCompletedProfile = hasProfile && profileIdentity.trim() !== "";

  function DashboardGuard({ children }) {
    if (loading || profileLoading) {
      return <div className="auth-info">Loading...</div>;
    }
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    if (!hasCompletedProfile) {
      return <Navigate to="/onboarding" replace />;
    }
    return children;
  }

  function OnboardingGuard({ children }) {
    if (loading || profileLoading) {
      return <div className="auth-info">Loading...</div>;
    }
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    if (hasCompletedProfile) {
      return <Navigate to="/" replace />;
    }
    return children;
  }

  return (
    <main className="page-shell">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/onboarding" element={<OnboardingGuard><Onboarding /></OnboardingGuard>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardGuard><Dashboard /></DashboardGuard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}

export default App;
