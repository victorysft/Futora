import DashboardLayout from "../components/DashboardLayout";

export default function Focus() {
  return (
    <DashboardLayout pageTitle="MY FOCUS">
      <div className="d-content">
        <div className="d-row">
          <div className="d-card">
            <h2 style={{ 
              fontSize: "1.8rem", 
              fontWeight: "600", 
              color: "rgba(255, 255, 255, 0.85)",
              margin: "0 0 0.5rem 0" 
            }}>
              My Focus
            </h2>
            <p style={{ 
              fontSize: "0.9rem", 
              color: "rgba(255, 255, 255, 0.45)",
              margin: 0 
            }}>
              Coming soon
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
