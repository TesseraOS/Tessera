import type React from 'react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps extends Omit<React.ComponentProps<'div'>, 'id'> {
  /** Applied to the h2 so sections can reference it via aria-labelledby. */
  id?: string;
  title: string;
  lead?: string;
  align?: 'left' | 'center';
}

/** Section h2 + optional lead (MARKETING-DESIGN §4). No eyebrows — hero only (§1.7). */
export const SectionHeading = ({
  id,
  title,
  lead,
  align = 'left',
  className,
  ...props
}: SectionHeadingProps) => (
  <div
    className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}
    {...props}
  >
    <h2 id={id} className="text-title text-foreground">
      {title}
    </h2>
    {lead ? <p className="text-lead text-muted-foreground mt-4">{lead}</p> : null}
  </div>
);
