import type React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tessera mark — "fragments of memory coming together": scattered tesserae converge into a
 * solid core. Ported from the dashboard (apps/web/components/logo.tsx) per
 * MARKETING-DESIGN §4 — same mark, no redesign. Monochrome (currentColor).
 */
export const LogoIcon = ({ className, ...props }: React.ComponentProps<'svg'>) => (
  <svg
    viewBox="0 0 32 32"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    {...props}
  >
    {/* assembled core */}
    <rect x="13" y="13" width="6.5" height="6.5" rx="1.4" />
    <rect x="20.5" y="13" width="6.5" height="6.5" rx="1.4" fillOpacity="0.82" />
    <rect x="13" y="20.5" width="6.5" height="6.5" rx="1.4" fillOpacity="0.82" />
    {/* converging fragments */}
    <rect x="6" y="13.5" width="5" height="5" rx="1.1" fillOpacity="0.5" />
    <rect x="13.5" y="6" width="5" height="5" rx="1.1" fillOpacity="0.5" />
    <rect x="21.5" y="21.5" width="4" height="4" rx="1" fillOpacity="0.3" />
    <rect x="6.5" y="6.5" width="4" height="4" rx="1" fillOpacity="0.3" />
  </svg>
);

interface LogoProps extends React.ComponentProps<'span'> {
  iconClassName?: string;
  textClassName?: string;
}

export const Logo = ({ className, iconClassName, textClassName, ...props }: LogoProps) => (
  <span className={cn('flex items-center gap-2.5', className)} {...props}>
    <LogoIcon className={cn('text-foreground size-6', iconClassName)} />
    <span className={cn('text-foreground text-heading select-none', textClassName)}>Tessera</span>
  </span>
);
