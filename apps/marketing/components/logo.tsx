import type React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tessera mark v2 (BRAND.md §4, masters in docs/design/brand/): a 3×3 mosaic of ivory
 * tiles with the top-right tile lifted out of the grid, gilded in the ember gradient —
 * the fragment that completes the picture. Tiles ride currentColor; the ember gradient
 * uses the brand tokens. Pass a unique `emberId` when several marks share a page.
 */
interface LogoIconProps extends React.ComponentProps<'svg'> {
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
        <stop offset="0" stopColor="var(--rose)" />
        <stop offset="1" stopColor="var(--gold)" />
      </linearGradient>
    </defs>
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
    <rect x="83" y="5" width="24" height="24" rx="7" fill={`url(#${emberId})`} />
  </svg>
);

interface LogoProps extends React.ComponentProps<'span'> {
  emberId?: string;
  iconClassName?: string;
  textClassName?: string;
}

/** Horizontal lockup: mark + lowercase serif wordmark (never bold). */
export const Logo = ({ className, emberId, iconClassName, textClassName, ...props }: LogoProps) => (
  <span className={cn('flex items-center gap-2.5', className)} {...props}>
    <LogoIcon emberId={emberId} className={cn('text-foreground size-7', iconClassName)} />
    <span
      className={cn(
        'text-foreground font-serif text-heading font-normal select-none',
        textClassName,
      )}
    >
      tessera
    </span>
  </span>
);
