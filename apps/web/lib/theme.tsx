'use client';

/**
 * Appearance state + radial propagation (DESIGN-SYSTEM §0.1, ADR-0047).
 *
 * Two orthogonal axes on <html>: MODE (.dark class — owned by next-themes, `system`
 * supported) and THEME (data-theme attribute — owned here, persisted to localStorage,
 * pre-paint applied by lib/theme-script.ts). Components stay token-only; only appearance
 * controls import this module.
 *
 * Changes ripple as a radial view transition growing from the control that asked
 * (marketing's proven pattern, ADR-0044/0045): one startViewTransition wraps the theme
 * and/or mode mutation, then the new snapshot is revealed through an expanding clip-path
 * circle. Skipped cleanly (instant switch) when the API is missing, the visitor prefers
 * reduced motion, or no origin is given.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useTheme as useNextTheme } from 'next-themes';
import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeName, type ThemeName } from '@/lib/theme-script';

type Listener = () => void;
const listeners = new Set<Listener>();

function readTheme(): ThemeName {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const current = document.documentElement.getAttribute('data-theme');
  return isThemeName(current) ? current : DEFAULT_THEME;
}

function writeTheme(next: ThemeName): void {
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* storage unavailable (private mode) — the attribute still applies for this visit */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Cross-tab sync: another tab's switch updates this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY && isThemeName(event.newValue)) {
      document.documentElement.setAttribute('data-theme', event.newValue);
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The active theme (reactive). SSR snapshot is the default; the init script has already
 *  applied the persisted value before hydration, so no flash occurs. */
export function useDashboardTheme(): ThemeName {
  return useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
}

export interface TransitionOrigin {
  x: number;
  y: number;
}

export interface AppearanceChange {
  /** Theme catalog entry (data-theme). Omit to keep the current theme. */
  theme?: ThemeName;
  /** Mode for next-themes: 'light' | 'dark' | 'system'. Omit to keep the current mode. */
  mode?: string;
}

/**
 * Appearance control surface: current axes + a setter that ripples from `origin`
 * (viewport px — pass the pressed control's center). Falls back to an instant switch
 * without the View Transitions API, under prefers-reduced-motion, or with no origin.
 */
export function useAppearanceTransition() {
  const { theme: mode, resolvedTheme: resolvedMode, setTheme: setMode } = useNextTheme();
  const theme = useDashboardTheme();

  const setAppearance = useCallback(
    (change: AppearanceChange, origin?: TransitionOrigin) => {
      const apply = () => {
        if (change.theme && change.theme !== readTheme()) writeTheme(change.theme);
        if (change.mode) setMode(change.mode);
      };

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (typeof document.startViewTransition !== 'function' || reduced || !origin) {
        apply();
        return;
      }

      const transition = document.startViewTransition(() => {
        flushSync(apply);
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
          /* transition skipped (e.g. rapid toggling) — the appearance change itself landed */
        });
    },
    [setMode],
  );

  return { theme, mode, resolvedMode, setAppearance };
}
