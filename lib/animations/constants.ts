/**
 * Shared animation configuration constants
 * Used across components for consistent animations
 */

// Spring configurations for Framer Motion
export const SPRING_CONFIGS = {
  // Default smooth spring
  default: { damping: 25, stiffness: 100 },
  // Bouncy spring for playful interactions
  bouncy: { damping: 10, stiffness: 200 },
  // Stiff spring for quick, precise movements
  stiff: { damping: 30, stiffness: 300 },
  // Soft spring for gentle movements
  soft: { damping: 20, stiffness: 80 },
} as const;

// Animation durations (in seconds)
export const ANIMATION_DURATION = {
  fast: 0.3,
  normal: 0.5,
  slow: 0.8,
  verySlow: 1.2,
} as const;

// Common animation variants for Framer Motion
export const FADE_IN_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const SLIDE_UP_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const SCALE_IN_VARIANTS = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
};
