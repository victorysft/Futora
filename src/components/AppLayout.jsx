import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./AppLayout.css";

const sidebarLinks = [
  { label: "Dashboard", to: "/app" },
  { label: "Goals", to: "/app/goals" },
  { label: "Momentum", to: "/app/momentum" },
  { label: "Settings", to: "/app/settings" },
];

export default function AppLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggleSidebar = () => setCollapsed(prev => !prev);

  return (
    <div className={collapsed ? "app-shell collapsed" : "app-shell"}>
      <header className="app-header">
        <div className="brand-mark">Futora</div>
        <div className="header-actions">
          <button className="collapse-toggle" onClick={toggleSidebar}>
            {collapsed ? "Expand" : "Hide"}
          </button>
          <div className="user-avatar">FL</div>
        </div>
      </header>

      <div className="app-layout">
        <aside className="app-sidebar">
          <div className="sidebar-inner">
            <div className="sidebar-title">Spaces</div>
            <nav className="sidebar-nav">
              {sidebarLinks.map(link => (
                <NavLink
                  key={link.label}
                  to={link.to}
                  end={link.to === "/app"}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? "active" : ""}`
                  }
                >
                  <span className="sidebar-dot" />
                  <span className="sidebar-label">{link.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>

        <main className="app-main">
          <div className="main-surface">{children}</div>
        </main>
      </div>
    </div>
  );
}
