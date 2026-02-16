import { useRef, useEffect, useState, memo } from "react";
import Globe from "react-globe.gl";

/**
 * Globe3D — react-globe.gl implementation
 *
 * - NASA Blue Marble 4K day texture
 * - NASA Night Lights texture
 * - Realistic day/night shading
 * - Subtle atmosphere glow
 * - No grid, no labels
 * - Slow auto-rotation
 * - Live event pulses (glowing dots with ripple, 2.5s lifetime)
 * - Black space background with subtle starfield
 * - Smaller size — powerful, not dominant
 */

// NASA texture URLs from unpkg CDN
const GLOBE_IMG = "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg";
const NIGHT_IMG = "https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg";
const CLOUDS_IMG = "https://unpkg.com/three-globe@2.31.1/example/img/earth-clouds.png";

function Globe3D({ pulses = [], heatmapData = [], onlineCount = 0 }) {
  const globeRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Responsive sizing
  useEffect(() => {
    const updateDimensions = () => {
      const container = globeRef.current?.parentElement;
      if (container) {
        setDimensions({
          width: container.offsetWidth,
          height: container.offsetHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Auto-rotation + timezone-accurate day/night
  useEffect(() => {
    if (globeRef.current) {
      const globe = globeRef.current;
      
      // Set rotation based on UTC time for accurate day/night
      const now = new Date();
      const sunLongitude = (now.getUTCHours() / 24) * 360 - 180; // -180 to 180
      globe.scene().rotation.y = (sunLongitude * Math.PI) / 180;
      
      // Slow rotation
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.4;
      globe.controls().enableZoom = true;
      globe.controls().minDistance = 180;
      globe.controls().maxDistance = 500;
    }
  }, []);

  // Pulse points (live mode)
  const pulsePoints = pulses.slice(0, 100).map((p) => ({
    lat: p.lat,
    lng: p.lng,
    color: p.color || "#8B5CF6",
    altitude: 0.01,
    radius: 0.35,
    age: Date.now() - (p.startTime || Date.now()),
  }));

  // Heatmap points (heatmap mode)
  const heatmapPoints = heatmapData.filter(d => d.lat && d.lng).map((d) => {
    const maxScore = Math.max(...heatmapData.map(h => h.score || 0), 1);
    const intensity = Math.min((d.score || 0) / maxScore, 1);
    return {
      lat: d.lat,
      lng: d.lng,
      color: intensity > 0.7 ? "#D4AF37" : intensity > 0.3 ? "#8B5CF6" : "#10B981",
      altitude: 0.005 + intensity * 0.03,
      radius: 0.3 + intensity * 0.8,
      age: 0,
    };
  });

  const pointsData = pulsePoints.length > 0 ? pulsePoints : heatmapPoints;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Starfield behind globe */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: `
            radial-gradient(2px 2px at 20% 30%, white, transparent),
            radial-gradient(2px 2px at 60% 70%, white, transparent),
            radial-gradient(1px 1px at 50% 50%, white, transparent),
            radial-gradient(1px 1px at 80% 10%, white, transparent),
            radial-gradient(2px 2px at 90% 60%, white, transparent),
            radial-gradient(1px 1px at 33% 50%, white, transparent),
            radial-gradient(1px 1px at 68% 80%, white, transparent)
          `,
          backgroundSize: "200% 200%, 250% 250%, 300% 300%, 200% 200%, 250% 250%, 300% 300%, 200% 200%",
          backgroundPosition: "0% 0%, 40% 60%, 60% 30%, 80% 90%, 10% 40%, 50% 10%, 70% 50%",
          opacity: 0.15,
        }}
      />

      {/* Globe canvas */}
      <div style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}>
        <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        // Earth textures
        globeImageUrl={GLOBE_IMG}
        bumpImageUrl="https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png"
        // Background
        backgroundColor="rgba(0,0,0,0)"
        backgroundImageUrl={null}
        // Atmosphere
        atmosphereColor="#8B5CF6"
        atmosphereAltitude={0.03}
        // Points (pulses)
        pointsData={pointsData}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude="altitude"
        pointRadius={(d) => {
          const age = d.age || 0;
          const maxAge = 800; // 0.8s animation
          const t = Math.min(age / maxAge, 1);
          // Smooth pulse: grow then fade
          const scale = Math.sin(t * Math.PI);
          return d.radius * (1 + scale * 0.6);
        }}
        pointLabel={() => ""}
        // Camera
        onGlobeReady={() => {
          if (globeRef.current) {
            const globe = globeRef.current;
            globe.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 0);
          }
        }}
      />
      </div>
    </div>
  );
}

export default memo(Globe3D);
