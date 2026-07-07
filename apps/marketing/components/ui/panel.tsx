import type React from 'react';
import { cn } from '@/lib/utils';

/** Bordered surface (MARKETING-DESIGN §4) — flat, hairline border, no shadows (§2.2). */
export const Panel = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('bg-card rounded-lg border', className)} {...props} />
);
