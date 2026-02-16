import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "../pages/Dashboard.css";

/* ── Sidebar nav items with routes ── */
const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "My Focus", path: "/focus" },
  { label: "Progress", path: "/progress" },
  { label: "Leaderboard", path: "/leaderboard" },
  { label: "Global Live", path: "/global" },
  { label: "Network", path: "/network" },
  { label: "Profile", path: "/profile" },
  { label: "Settings", path: "/settings" },
];

export default function DashboardLayout({ children, pageTitle = "DASHBOARD" }) {
  const { profile, signOut } = useAuth();

  const becoming = profile?.becoming || profile?.identity || "";

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="d-shell">
      {/* ═══════════ SIDEBAR ═══════════ */}
      <aside className="d-sidebar">
        <div className="d-sidebar-top">
          <span className="d-wordmark">FUTORA</span>
        </div>

        <nav className="d-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `d-nav-item${isActive ? " d-nav-active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="d-sidebar-bottom">
          <button className="d-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══════════ MAIN AREA ═══════════ */}
      <div className="d-main">
        {/* ─── TOPBAR ─── */}
        <header className="d-topbar">
          <span className="d-topbar-label">{pageTitle}</span>
          <div className="d-topbar-identity">
            <span className="d-topbar-becoming">BECOMING</span>
            <span className="d-topbar-divider" />
            <span className="d-topbar-name">{becoming}</span>
          </div>
        </header>

        {/* ─── CONTENT ─── */}
        {children}
      </div>
    </div>
  );
}
