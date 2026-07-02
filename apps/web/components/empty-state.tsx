import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** First-class empty state for async surfaces (UX baseline, FR-49). */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3.5 rounded-xl bg-card p-8 text-center border-none shadow-none dark:ring-0',
        className,
      )}
    >
      {Icon ? (
        <div className="bg-muted/50 text-muted-foreground flex size-10 items-center justify-center rounded-full [&_svg]:size-5">
          <Icon aria-hidden="true" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-xs text-[11px] leading-normal">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
