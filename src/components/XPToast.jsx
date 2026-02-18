import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

/**
 * XPToast — Floating micro-notification after check-in.
 *
 * Shows: "+20 XP · Streak 5" or rank change "You passed Alex (#14)"
 * Auto-dismisses after 4 seconds.
 *
 * Props:
 *  - show: boolean
 *  - xpGained: number
 *  - streak: number
 *  - rankChange: { passed: string, newRank: number } | null
 *  - levelUp: { from: number, to: number } | null
 *  - onDismiss: () => void
 */
export default function XPToast({ show, xpGained = 0, streak = 0, rankChange = null, levelUp = null, onDismiss }) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => onDismiss?.(), 4000);
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          style={styles.container}
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
        >
          {/* Main XP line */}
          <div style={styles.mainLine}>
            <span style={styles.xpBadge}>+{xpGained} XP</span>
            {streak > 0 && (
              <span style={styles.streakBadge}>
                Streak {streak}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: 3, verticalAlign: "middle"}}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              </span>
            )}
          </div>

          {/* Level up notification */}
          {levelUp && (
            <motion.div
              style={styles.levelUpLine}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Level {levelUp.from} → Level {levelUp.to}
            </motion.div>
          )}

          {/* Rank change notification */}
          {rankChange && (
            <motion.div
              style={styles.rankLine}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              You just passed {rankChange.passed} (Rank #{rankChange.newRank})
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const styles = {
  container: {
    position: "fixed",
    bottom: "32px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    background: "rgba(10, 10, 14, 0.92)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(139, 92, 246, 0.25)",
    borderRadius: "14px",
    padding: "14px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    boxShadow: "0 8px 48px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(139, 92, 246, 0.08)",
    minWidth: "240px",
    textAlign: "center",
  },
  mainLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
  },
  xpBadge: {
    color: "#8B5CF6",
    fontWeight: 700,
    fontSize: "18px",
    letterSpacing: "0.5px",
  },
  streakBadge: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: "14px",
    fontWeight: 500,
  },
  levelUpLine: {
    color: "#FFD700",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.3px",
  },
  rankLine: {
    color: "#10B981",
    fontSize: "12px",
    fontWeight: 500,
    letterSpacing: "0.2px",
  },
};
