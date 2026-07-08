'use client';

/**
 * The theme seam (ADR-0044/0045) — the ONLY file allowed to import next-themes
 * (design-lint enforces the boundary). v4.1: the initial theme follows the visitor's
 * system preference (dark → Desert Rose dusk, light → Modern Minimalist noon); with no
 * resolvable preference the classless :root styles ARE dusk, so the fallback is dusk by
 * construction. The footer toggle still pins an explicit choice.
 *
 * Theme changes propagate as a radial view transition growing from the control that
 * asked for them (startViewTransition + a clip-path circle) — skipped cleanly when the
 * API is missing or the visitor prefers reduced motion.
 */
import type React from 'react';
import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';

export { useTheme };

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

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
