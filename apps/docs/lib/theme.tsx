'use client';

/**
 * The theme seam (ADR-0054, ported from marketing ADR-0044/0045) — the ONLY file allowed
 * to touch theme state (design-lint enforces the boundary). `useTheme` is re-imported
 * from fumadocs-ui's provider so we share the exact next-themes context RootProvider
 * mounted (a second next-themes instance would fork the context and desync the toggle).
 *
 * Theme changes propagate as a radial view transition growing from the pressed control —
 * skipped cleanly (instant switch) when the API is missing or the visitor prefers
 * reduced motion. Hardening from the F-053 polish pass (probe-verified in a visible
 * Chromium, where hidden documents abort every view transition):
 *
 * - RAPID TOGGLING: a second press used to hard-abort the in-flight transition (the
 *   circle died mid-screen with a flash — probe: `finished` 13ms after `ready`). Now the
 *   in-flight transition is `skipTransition()`ed to its end state first, so consecutive
 *   presses read as crisp sequential ripples.
 * - ORIGIN: the ripple anchors to the CONTROL'S CENTER (the dashboard convention), not
 *   the pointer position — deterministic for mouse, keyboard, and assistive tech alike.
 * - The default `::view-transition-group(root)` 250ms animation is disabled in
 *   globals.css (it raced the 550ms clip for the transition's lifetime) and the
 *   old/new stacking order is pinned there explicitly.
 */
import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useTheme } from 'fumadocs-ui/provider/base';

export { useTheme };

interface TransitionOrigin {
  x: number;
  y: number;
}

/** The transition currently animating, so a new press can settle it instantly first. */
let activeTransition: ViewTransition | null = null;

/**
 * setTheme that ripples out from `origin` (viewport px — pass the pressed control's
 * center). Falls back to an instant switch without the View Transitions API or under
 * prefers-reduced-motion.
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

      // A press mid-ripple: jump the in-flight transition to its end state instead of
      // letting the new one hard-abort it (which flashes the half-revealed theme away).
      activeTransition?.skipTransition();

      const transition = document.startViewTransition(() => {
        flushSync(() => setTheme(next));
      });
      activeTransition = transition;
      transition.finished.finally(() => {
        if (activeTransition === transition) activeTransition = null;
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
