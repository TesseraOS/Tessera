import { cn } from '@/lib/utils';

const COLORS = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  muted: 'bg-muted-foreground',
} as const;

/** Small status dot with an optional ping pulse (online/away/etc.). */
export function StatusIndicator({
  color = 'emerald',
  pulse = false,
  className,
}: {
  color?: keyof typeof COLORS;
  pulse?: boolean;
  className?: string;
}) {
  const bg = COLORS[color];
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden="true">
      {pulse ? (
        <span
          className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', bg)}
        />
      ) : null}
      <span className={cn('relative inline-flex size-2 rounded-full', bg)} />
    </span>
  );
}
