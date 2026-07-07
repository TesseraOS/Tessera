import type React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Inline text link — the underline draws in (micro-interaction, §5). */
export const TextLink = ({ className, ...props }: React.ComponentProps<typeof Link>) => (
  <Link
    className={cn(
      'link-underline text-foreground hover:text-rose transition-colors duration-200',
      className,
    )}
    {...props}
  />
);
