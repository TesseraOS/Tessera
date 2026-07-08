import type React from 'react';
import { cn } from '@/lib/utils';

/** Mono label badge (MARKETING-DESIGN §4): hairline border, transparent background. */
export const Badge = ({ className, ...props }: React.ComponentProps<'span'>) => (
  <span
    className={cn(
      'text-label text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1',
      className,
    )}
    {...props}
  />
);
