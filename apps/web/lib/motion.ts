import type { Variants } from 'framer-motion';

// Functional motion primitives (DESIGN-SYSTEM §5): fast, ~150–250ms, ease-out entrances.
// Global `prefers-reduced-motion` is honored via <MotionConfig reducedMotion="user"> in
// app/providers.tsx, so these variants don't need per-use guards.

export const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const durations = {
  fast: 0.15,
  base: 0.2,
  slow: 0.25,
} as const;

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.base, ease: easeOut } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: durations.base, ease: easeOut } },
};

/** Stagger children for list/grid entrances. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};
