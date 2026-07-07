import type React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Inline text link (MARKETING-DESIGN §4) — underline is reserved for links (§2.3). */
export const TextLink = ({ className, ...props }: React.ComponentProps<typeof Link>) => (
  <Link
    className={cn(
      'text-foreground decoration-border-strong hover:decoration-foreground underline underline-offset-4 transition-colors',
      className,
    )}
    {...props}
  />
);
