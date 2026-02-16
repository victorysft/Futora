import { useState, useEffect, useRef } from "react";

/**
 * useCountUp
 * 
 * Smooth count-up animation for numbers.
 * Returns current animated value and hasChanged flag.
 * 
 * Usage:
 * const [displayValue, hasChanged] = useCountUp(targetValue, { duration: 800 });
 */
export function useCountUp(target, options = {}) {
  const { duration = 800, onComplete } = options;
  const [current, setCurrent] = useState(target);
  const [hasChanged, setHasChanged] = useState(false);
  const animationRef = useRef(null);
  const prevTargetRef = useRef(target);

  useEffect(() => {
    // Check if value changed
    if (target !== prevTargetRef.current) {
      setHasChanged(true);
      prevTargetRef.current = target;

      // Clear previous animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      const startValue = current;
      const diff = target - startValue;
      const startTime = performance.now();

      const animate = (time) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const newValue = startValue + diff * easeOut;

        setCurrent(Math.round(newValue));

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setCurrent(target);
          if (onComplete) onComplete();
        }
      };

      animationRef.current = requestAnimationFrame(animate);

      // Remove hasChanged flag after animation
      const timer = setTimeout(() => {
        setHasChanged(false);
      }, duration + 500);

      return () => {
        clearTimeout(timer);
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [target, duration, current, onComplete]);

  return [current, hasChanged];
}
