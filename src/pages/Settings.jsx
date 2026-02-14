import { useAuth } from "../hooks/useAuth";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="page-section">
      <div className="dashboard-card-surface">
        <div className="panel-heading">
          <span className="panel-title">Account Settings</span>
          <span className="panel-sub">Control</span>
        </div>
        <div className="panel-copy">
          <p>Email: <strong>{user?.email}</strong></p>
          <p>More personalization controls coming soon.</p>
        </div>
      </div>
    </div>
  );
}
