import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { OnboardingProvider } from "./context/OnboardingContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Focus from "./pages/Focus";
import Progress from "./pages/Progress";
import Leaderboard from "./pages/Leaderboard";
import GlobalLive from "./pages/GlobalLive";
import Network from "./pages/Network";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Feed from "./pages/Feed";
import Communities from "./pages/Communities";
import CommunityDetail from "./pages/CommunityDetail";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import "./App.css";

/* ── Loading screen ── */
function LoadingScreen() {
  return <div className="auth-info">Loading...</div>;
}

/* ── Route Guards ── */
function AuthGuard({ children }) {
  const { user, loading, profileLoading } = useAuth();
  if (loading || profileLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function OnboardingGuard({ children }) {
  const { user, loading, profile, profileLoading } = useAuth();
  if (loading || profileLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.profile_completed === true) return <Navigate to="/dashboard" replace />;
  return children;
}

function DashboardGuard({ children }) {
  const { user, loading, profile, profileLoading } = useAuth();
  if (loading || profileLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.profile_completed !== true) return <Navigate to="/onboarding/step-1" replace />;
  return children;
}

function GuestGuard({ children }) {
  const { user, loading, profile, profileLoading } = useAuth();
  if (loading || profileLoading) return <LoadingScreen />;
  if (user && profile) {
    if (profile.profile_completed === true) return <Navigate to="/dashboard" replace />;
    return <Navigate to="/onboarding/step-1" replace />;
  }
  if (user && !profile) {
    // User exists but no profile row yet — send to onboarding
    return <Navigate to="/onboarding/step-1" replace />;
  }
  return children;
}

/* ── Root redirect — checks auth before routing ── */
function RootRedirect() {
  const { user, loading, profile, profileLoading } = useAuth();
  if (loading || profileLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.profile_completed === true) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/onboarding/step-1" replace />;
}

function App() {
  return (
    <OnboardingProvider>
      <main className="page-shell">
        <Routes>
          {/* Root — smart redirect based on auth state */}
          <Route path="/" element={<RootRedirect />} />

          {/* Public — redirect if already logged in */}
          <Route path="/login" element={<GuestGuard><Login /></GuestGuard>} />
          <Route path="/signup" element={<GuestGuard><Signup /></GuestGuard>} />

          {/* Onboarding — must be logged in, profile NOT completed */}
          <Route path="/onboarding/:step" element={<OnboardingGuard><Onboarding /></OnboardingGuard>} />

          {/* Dashboard — must be logged in, profile completed */}
          <Route path="/dashboard" element={<DashboardGuard><Dashboard /></DashboardGuard>} />
          <Route path="/focus" element={<DashboardGuard><Focus /></DashboardGuard>} />
          <Route path="/progress" element={<DashboardGuard><Progress /></DashboardGuard>} />
          <Route path="/leaderboard" element={<DashboardGuard><Leaderboard /></DashboardGuard>} />
          <Route path="/global" element={<DashboardGuard><GlobalLive /></DashboardGuard>} />
          <Route path="/network" element={<DashboardGuard><Network /></DashboardGuard>} />
          <Route path="/feed" element={<DashboardGuard><Feed /></DashboardGuard>} />
          <Route path="/communities" element={<DashboardGuard><Communities /></DashboardGuard>} />
          <Route path="/communities/:slug" element={<DashboardGuard><CommunityDetail /></DashboardGuard>} />
          <Route path="/profile" element={<DashboardGuard><Profile /></DashboardGuard>} />
          <Route path="/settings" element={<DashboardGuard><Settings /></DashboardGuard>} />

          {/* Catch-all — smart redirect, not blind /login */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </main>
    </OnboardingProvider>
  );
}

export default App;
