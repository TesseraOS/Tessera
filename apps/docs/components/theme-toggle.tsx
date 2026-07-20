'use client';

import { useEffect, useState } from 'react';
import { useThemeTransition } from '@/lib/theme';

/**
 * The docs theme toggle — mounted into the Fumadocs layouts through the `themeSwitch`
 * slot, so the stock control is replaced everywhere it appears (nav + sidebar footer).
 * The switch propagates radially from the pressed control (ADR-0054); an explicit
 * choice pins the theme, matching marketing's footer toggle semantics.
 */
export function ThemeToggle() {
  const { resolvedTheme, setThemeWithTransition } = useThemeTransition();
  const [mounted, setMounted] = useState(false);

  // next-themes resolves the theme on the client only; render a neutral shell until
  // mounted so server and client markup agree (the recorded hydration lesson).
  useEffect(() => {
    setMounted(true);
  }, []);

  const isLight = mounted && resolvedTheme === 'light';
  const label = isLight ? 'Switch to the dusk (dark) theme' : 'Switch to the noon (light) theme';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-theme-toggle
      onClick={(event) =>
        setThemeWithTransition(isLight ? 'dark' : 'light', {
          x: event.clientX || event.currentTarget.getBoundingClientRect().x,
          y: event.clientY || event.currentTarget.getBoundingClientRect().y,
        })
      }
      className="text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex size-8 items-center justify-center rounded-full transition-colors duration-200"
    >
      {/* One glyph pair, both always in the DOM (SSR-identical markup); CSS shows one. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="size-[18px]"
      >
        {/* moon — visible on dusk (offer: stay) */}
        <path
          className={isLight ? 'hidden' : ''}
          d="M20.4 14.1A8.5 8.5 0 1 1 9.9 3.6a7 7 0 1 0 10.5 10.5Z"
        />
        {/* sun — visible on noon */}
        <g className={isLight ? '' : 'hidden'}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
        </g>
      </svg>
    </button>
  );
}
