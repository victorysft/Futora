import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";

/* ── Monolith core object ── */
function Monolith() {
  const meshRef = useRef();
  const sweepRef = useRef();
  const clockRef = useRef(0);

  /* Slow Y rotation: ~40s full loop */
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += (Math.PI * 2) / 40 * delta;
    }

    /* Diagonal light sweep every ~9 seconds */
    clockRef.current += delta;
    if (sweepRef.current) {
      const cycle = clockRef.current % 9;
      const t = cycle / 9;
      /* Sweep moves from bottom-left to top-right */
      sweepRef.current.position.x = THREE.MathUtils.lerp(-4, 4, t);
      sweepRef.current.position.y = THREE.MathUtils.lerp(-3, 3, t);
      /* Fade in and out */
      const fade = Math.sin(t * Math.PI);
      sweepRef.current.intensity = fade * 0.35;
    }
  });

  const monolithMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0a0a0a"),
        metalness: 0.92,
        roughness: 0.25,
        envMapIntensity: 0.4,
      }),
    []
  );

  return (
    <group>
      {/* Main monolith — tall, slim, vertical */}
      <mesh ref={meshRef} material={monolithMaterial} castShadow>
        <boxGeometry args={[0.7, 2.8, 0.25]} />
      </mesh>

      {/* Subtle metallic edge highlights (thin strips) */}
      <mesh position={[0.36, 0, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.012, 2.82, 0.26]} />
        <meshStandardMaterial
          color="#1a1a2a"
          metalness={1}
          roughness={0.1}
          emissive="#1a1a3a"
          emissiveIntensity={0.08}
        />
      </mesh>
      <mesh position={[-0.36, 0, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.012, 2.82, 0.26]} />
        <meshStandardMaterial
          color="#1a1a2a"
          metalness={1}
          roughness={0.1}
          emissive="#1a1a3a"
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Ambient fill — very low */}
      <ambientLight intensity={0.06} color="#ffffff" />

      {/* Key light — soft, from upper right */}
      <directionalLight
        position={[3, 4, 2]}
        intensity={0.2}
        color="#c0c8e0"
      />

      {/* Rim light — subtle blue from behind */}
      <pointLight
        position={[-2, 1, -3]}
        intensity={0.12}
        color="#3a4a6a"
        distance={10}
        decay={2}
      />

      {/* Diagonal sweep light */}
      <pointLight
        ref={sweepRef}
        position={[-4, -3, 2]}
        intensity={0}
        color="#8090b0"
        distance={8}
        decay={2}
      />
    </group>
  );
}

/* ── Vignette overlay (CSS-drawn) ── */
function VignetteOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
        zIndex: 1,
      }}
    />
  );
}

/* ── Exported scene ── */
export default function MonolithScene() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <VignetteOverlay />
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        style={{
          background:
            "radial-gradient(ellipse at center, #0F0F0F 0%, #000000 100%)",
        }}
      >
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#000000", 6, 14]} />
        <Environment preset="night" environmentIntensity={0.15} />
        <Monolith />
      </Canvas>
    </div>
  );
}
