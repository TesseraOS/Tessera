import type React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Local copy of the apps' `cn`. The package carries its own rather than importing an app's, and it
 * has to be tailwind-merge and not string concatenation: the defaults below are Tailwind utilities,
 * so a caller passing `size-5` alongside a default `size-7` would otherwise emit *both* and let
 * stylesheet order pick the winner.
 */
function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * The Tessera logo system (BRAND.md §4), ported from the master
 * `docs/design/brand/tessera-mark.svg` — geometry, viewBox and ember stops unchanged.
 *
 * **Why this is a package and not a component in each app.** It used to be a component in each app,
 * and they diverged: marketing shipped mark v2 while the dashboard still rendered v1 (a monochrome
 * *pixel* mark on a different viewBox entirely) for as long as v2 had existed. Two hand-maintained
 * copies of a brand asset drift the moment one is updated. `@tessera/mascot` set the precedent for a
 * shared brand asset consumed by both apps; this follows it.
 *
 * **The mark:** a 3×3 mosaic of tiles with the top-right tile lifted out of the grid and gilded in
 * the ember gradient — "the fragment that completes the picture". Tiles ride `currentColor`, so the
 * mosaic is theme-true anywhere without configuration.
 *
 * **Closed theming contract**, and every value falls back safely (the `@tessera/mascot` pattern):
 *
 * | Token | Falls back to | Meaning |
 * |---|---|---|
 * | `--brand-ember-from` | `currentColor` | ember gradient start (rose) |
 * | `--brand-ember-to`   | `currentColor` | ember gradient end (gold) |
 * | `--brand-wordmark-font` | `ui-serif, serif` | the lockup's face — Instrument Serif per BRAND.md |
 *
 * An **unbound** app therefore renders a *monochrome* mark — which BRAND.md §4 explicitly sanctions
 * as the fallback ("all-ivory, or all-espresso on light") — never an invisible tile. That matters:
 * the dashboard runs four themes × two modes, and a gradient silently resolving to `transparent` in
 * some of them would be worse than the v1 this replaces.
 *
 * **Do not** recolor the ember per theme. BRAND.md forbids recoloring the mark outside the palette;
 * the mascot's per-theme warm accent is licensed by ADR-0047 for the *mascot*, and the mark is not
 * the mascot. Bind per light/dark mode only.
 */

interface LogoIconProps extends React.ComponentProps<'svg'> {
  /**
   * Unique id for this instance's gradient. SVG gradient ids are **document-global**, so two marks
   * on one page sharing an id means the second silently retargets the first's gradient. Pass a
   * distinct value when a page renders more than one mark.
   */
  emberId?: string | undefined;
}

export const LogoIcon = ({ className, emberId = 'ember-mark', ...props }: LogoIconProps) => (
  <svg
    viewBox="0 0 112 112"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <defs>
      <linearGradient id={emberId} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="var(--brand-ember-from, currentColor)" />
        <stop offset="1" stopColor="var(--brand-ember-to, currentColor)" />
      </linearGradient>
    </defs>

    {/* The assembled mosaic — graded, the picture almost complete. */}
    <g fill="currentColor">
      <rect x="14" y="14" width="24" height="24" rx="7" fillOpacity="0.55" />
      <rect x="44" y="14" width="24" height="24" rx="7" fillOpacity="0.8" />
      <rect x="14" y="44" width="24" height="24" rx="7" fillOpacity="0.8" />
      <rect x="44" y="44" width="24" height="24" rx="7" />
      <rect x="74" y="44" width="24" height="24" rx="7" fillOpacity="0.9" />
      <rect x="14" y="74" width="24" height="24" rx="7" fillOpacity="0.45" />
      <rect x="44" y="74" width="24" height="24" rx="7" fillOpacity="0.9" />
      <rect x="74" y="74" width="24" height="24" rx="7" fillOpacity="0.7" />
    </g>

    {/* The empty seat the lifted tile is arriving into. */}
    <rect
      x="75"
      y="15"
      width="22"
      height="22"
      rx="6.4"
      fill="none"
      stroke="currentColor"
      strokeOpacity="0.28"
      strokeWidth="1.6"
    />

    {/* The gilded tile, forever arriving. */}
    <rect x="83" y="5" width="24" height="24" rx="7" fill={`url(#${emberId})`} />
  </svg>
);

interface LogoProps extends React.ComponentProps<'span'> {
  emberId?: string;
  iconClassName?: string;
  textClassName?: string;
}

/**
 * Horizontal lockup: mark + `tessera` — lowercase, serif, **never bold** (BRAND.md §4).
 *
 * The defaults here are exactly the brand's *rules* (lowercase, serif face, not bold), carried from
 * one place so neither app can restate them differently. **Size is deliberately not among them**:
 * it is contextual — a nav, a footer and a sign-in card legitimately differ — so callers pass it via
 * `textClassName`, and each app keeps using its own type scale rather than importing the other's.
 */
export const Logo = ({ className, emberId, iconClassName, textClassName, ...props }: LogoProps) => (
  <span className={cn('flex items-center gap-2.5', className)} {...props}>
    <LogoIcon emberId={emberId} className={cn('text-foreground size-7', iconClassName)} />
    <span
      className={cn('text-foreground font-normal select-none', textClassName)}
      style={{ fontFamily: 'var(--brand-wordmark-font, ui-serif, serif)' }}
    >
      tessera
    </span>
  </span>
);
