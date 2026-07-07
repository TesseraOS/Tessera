import type React from 'react';
import { cn } from '@/lib/utils';

/** The single content container (MARKETING-DESIGN §2.4). Nothing renders outside it except
 * full-bleed section band backgrounds. */
export const Container = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('mx-auto w-full max-w-6xl px-6 md:px-8', className)} {...props} />
);
