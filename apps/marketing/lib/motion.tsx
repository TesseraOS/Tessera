'use client';

/**
 * The motion seam (MARKETING-DESIGN §5, ADR-0043) — the ONLY file allowed to import
 * framer-motion (design-lint enforces the boundary). LazyMotion keeps the bundle lean;
 * MotionConfig honors prefers-reduced-motion everywhere. Consumers import { m, Reveal,
 * MotionProvider } from '@/lib/motion'.
 */
import type React from 'react';
import { LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion';

export { m };
export { useReducedMotion } from 'framer-motion';
export type { Variants } from 'framer-motion';

/** The house easing — warm settle (§5). */
export const thermalEase = [0.22, 0.61, 0.36, 1] as const;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

interface RevealProps extends React.ComponentProps<typeof m.div> {
  /** Stagger offset in ms (total stagger per group must stay <=700ms). */
  delay?: number;
}

/**
 * In-view thermal reveal: settle up 20px, once, ~20% visible. Never wrap the hero h1 /
 * LCP element (§1.4).
 */
export function Reveal({ delay = 0, ...props }: RevealProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.6, delay: delay / 1000, ease: [0.22, 0.61, 0.36, 1] }}
      {...props}
    />
  );
}
