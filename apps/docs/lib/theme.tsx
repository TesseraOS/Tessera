'use client';

/**
 * The theme seam (ADR-0054, ported from marketing ADR-0044/0045) — the ONLY file allowed
 * to touch theme state (design-lint enforces the boundary). `useTheme` is re-imported
 * from fumadocs-ui's provider so we share the exact next-themes context RootProvider
 * mounted (a second next-themes instance would fork the context and desync the toggle).
 *
 * Theme changes propagate as a radial view transition growing from the control that
 * asked for them (startViewTransition + a clip-path circle) — skipped cleanly when the
 * API is missing or the visitor prefers reduced motion.
 */
import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useTheme } from 'fumadocs-ui/provider/base';

export { useTheme };

interface TransitionOrigin {
  x: number;
  y: number;
}

/**
 * setTheme that ripples out from `origin` (viewport px). Falls back to an instant
 * switch without the View Transitions API or under prefers-reduced-motion.
 */
export function useThemeTransition() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const setThemeWithTransition = useCallback(
    (next: string, origin?: TransitionOrigin) => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (typeof document.startViewTransition !== 'function' || reduced || !origin) {
        setTheme(next);
        return;
      }
      const transition = document.startViewTransition(() => {
        flushSync(() => setTheme(next));
      });
      transition.ready
        .then(() => {
          const radius = Math.hypot(
            Math.max(origin.x, window.innerWidth - origin.x),
            Math.max(origin.y, window.innerHeight - origin.y),
          );
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${origin.x}px ${origin.y}px)`,
                `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
              ],
            },
            {
              duration: 550,
              easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)',
            },
          );
        })
        .catch(() => {
          /* transition skipped (e.g. rapid toggling) — the theme change itself landed */
        });
    },
    [setTheme],
  );

  return { theme, resolvedTheme, setThemeWithTransition };
}
