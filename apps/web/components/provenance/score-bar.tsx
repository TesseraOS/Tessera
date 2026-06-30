import { cn } from '@/lib/utils';

/** A labelled 0–1 score rendered as an accessible progress bar (used for package scores). */
export function ScoreBar({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{pct}%</span>
      </div>
      <div
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
