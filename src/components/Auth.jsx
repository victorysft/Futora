import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";

function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <Routes>
      <Route
        path="/"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : profile?.identity?.trim() ? (
            <Dashboard />
          ) : (
            <Navigate to="/onboarding" replace />
          )
        }
      />

      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        path="/onboarding"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : profile?.identity?.trim() ? (
            <Navigate to="/" replace />
          ) : (
            <Onboarding />
          )
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
