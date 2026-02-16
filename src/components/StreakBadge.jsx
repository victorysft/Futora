import { motion } from "framer-motion";

/**
 * StreakBadge — Compact streak display with flame icon.
 *
 * Props:
 *  - streak: number
 *  - size: "sm" | "md" (default "sm")
 *  - showLabel: boolean (default false)
 */
export default function StreakBadge({ streak = 0, size = "sm", showLabel = false }) {
  if (streak <= 0) return null;

  const isSm = size === "sm";
  const flameSize = isSm ? 12 : 16;
  const fontSize = isSm ? "12px" : "14px";
  const padding = isSm ? "2px 8px" : "4px 10px";
  const isHot = streak >= 7;
  const isBurning = streak >= 30;

  return (
    <motion.div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isSm ? "3px" : "5px",
        padding,
        borderRadius: "20px",
        background: isBurning
          ? "rgba(255, 140, 0, 0.12)"
          : isHot
          ? "rgba(255, 140, 0, 0.08)"
          : "rgba(255, 255, 255, 0.04)",
        border: isBurning
          ? "1px solid rgba(255, 140, 0, 0.2)"
          : "1px solid rgba(255, 255, 255, 0.06)",
      }}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <svg
        width={flameSize}
        height={flameSize * 1.25}
        viewBox="0 0 16 20"
        fill="none"
        style={{
          filter: isHot ? `drop-shadow(0 0 4px rgba(255, 140, 0, 0.4))` : "none",
        }}
      >
        <path
          d="M8 0C8 0 12 4 12 8C12 10.5 10 13 8 14C6 13 4 10.5 4 8C4 4 8 0 8 0Z"
          fill="url(#sbFlame)"
        />
        <defs>
          <linearGradient id="sbFlame" x1="8" y1="0" x2="8" y2="14" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF8C00" />
            <stop offset="1" stopColor="#FF4500" />
          </linearGradient>
        </defs>
      </svg>
      <span
        style={{
          color: isHot ? "#FF8C00" : "rgba(255, 255, 255, 0.6)",
          fontSize,
          fontWeight: 600,
          letterSpacing: "0.3px",
          lineHeight: 1,
        }}
      >
        {streak}
      </span>
      {showLabel && (
        <span
          style={{
            color: "rgba(255, 255, 255, 0.35)",
            fontSize: isSm ? "10px" : "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          day{streak !== 1 ? "s" : ""}
        </span>
      )}
    </motion.div>
  );
}
