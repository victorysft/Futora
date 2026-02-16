import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../supabaseClient";
import DashboardLayout from "../components/DashboardLayout";

export default function Settings() {
  const { user, profile, refreshProfile } = useAuth();
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setIsPrivate(profile.is_private || false);
    }
  }, [profile]);

  const handleTogglePrivacy = async () => {
    if (!user || saving) return;
    setSaving(true);
    setSaved(false);

    const newValue = !isPrivate;
    const { error } = await supabase
      .from("profiles")
      .update({ is_private: newValue })
      .eq("id", user.id);

    if (!error) {
      setIsPrivate(newValue);
      setSaved(true);
      refreshProfile();
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  return (
    <DashboardLayout pageTitle="SETTINGS">
      <div className="d-content">
        <div className="d-row">
          <div className="d-card">
            <h2 style={{ 
              fontSize: "1.8rem", 
              fontWeight: "600", 
              color: "rgba(255, 255, 255, 0.85)",
              margin: "0 0 1.5rem 0" 
            }}>
              Settings
            </h2>

            {/* Privacy Section */}
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={{ 
                fontSize: "0.85rem", 
                fontWeight: "600", 
                color: "rgba(255, 255, 255, 0.5)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 1rem 0" 
              }}>
                Privacy
              </h3>

              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1rem 1.2rem",
                background: "rgba(255, 255, 255, 0.03)",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}>
                <div>
                  <p style={{ 
                    fontSize: "0.95rem", 
                    color: "rgba(255, 255, 255, 0.85)",
                    margin: "0 0 0.3rem 0",
                    fontWeight: "500"
                  }}>
                    Private Profile
                  </p>
                  <p style={{ 
                    fontSize: "0.8rem", 
                    color: "rgba(255, 255, 255, 0.4)",
                    margin: 0 
                  }}>
                    {isPrivate 
                      ? "Only accepted followers can see your profile. New followers need approval." 
                      : "Your profile is visible to everyone. Anyone can follow you."}
                  </p>
                </div>
                <button
                  onClick={handleTogglePrivacy}
                  disabled={saving}
                  style={{
                    width: "52px",
                    height: "28px",
                    borderRadius: "14px",
                    border: "none",
                    cursor: saving ? "wait" : "pointer",
                    background: isPrivate 
                      ? "linear-gradient(135deg, #8B5CF6, #7C3AED)" 
                      : "rgba(255, 255, 255, 0.1)",
                    position: "relative",
                    transition: "background 0.3s ease",
                    flexShrink: 0,
                    marginLeft: "1rem",
                  }}
                >
                  <div style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: "white",
                    position: "absolute",
                    top: "3px",
                    left: isPrivate ? "27px" : "3px",
                    transition: "left 0.3s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }} />
                </button>
              </div>
              {saved && (
                <p style={{ 
                  fontSize: "0.8rem", 
                  color: "#10B981", 
                  margin: "0.5rem 0 0 0",
                  textAlign: "right" 
                }}>
                  ✓ Saved
                </p>
              )}
            </div>

            {/* Location Section */}
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={{ 
                fontSize: "0.85rem", 
                fontWeight: "600", 
                color: "rgba(255, 255, 255, 0.5)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 1rem 0" 
              }}>
                Location
              </h3>

              <div style={{
                padding: "1rem 1.2rem",
                background: "rgba(255, 255, 255, 0.03)",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}>
                <p style={{ 
                  fontSize: "0.95rem", 
                  color: "rgba(255, 255, 255, 0.85)",
                  margin: "0 0 0.3rem 0",
                  fontWeight: "500"
                }}>
                  {profile?.country || "Not set"}
                  {profile?.city ? ` · ${profile.city}` : ""}
                </p>
                <p style={{ 
                  fontSize: "0.8rem", 
                  color: "rgba(255, 255, 255, 0.4)",
                  margin: 0 
                }}>
                  {profile?.country_code 
                    ? `Country code: ${profile.country_code} · Timezone: ${profile.timezone || "auto"}` 
                    : "Location will be detected on next login."}
                </p>
              </div>
            </div>

            {/* Account Info */}
            <div>
              <h3 style={{ 
                fontSize: "0.85rem", 
                fontWeight: "600", 
                color: "rgba(255, 255, 255, 0.5)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                margin: "0 0 1rem 0" 
              }}>
                Account
              </h3>

              <div style={{
                padding: "1rem 1.2rem",
                background: "rgba(255, 255, 255, 0.03)",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}>
                <p style={{ 
                  fontSize: "0.95rem", 
                  color: "rgba(255, 255, 255, 0.85)",
                  margin: "0 0 0.3rem 0",
                  fontWeight: "500"
                }}>
                  {user?.email || "—"}
                </p>
                <p style={{ 
                  fontSize: "0.8rem", 
                  color: "rgba(255, 255, 255, 0.4)",
                  margin: 0 
                }}>
                  Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
