'use client';

import { createContext, useContext, type ComponentProps } from 'react';
import { ChevronDown, ChevronUp, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Signature trend chip (adapted from efferd Dashboard 3): emerald up / red down — the only
// functional accent in an otherwise monochrome system. Compose: <Delta value><DeltaIcon/><DeltaValue/>.

const DeltaContext = createContext<number | null>(null);

function useDeltaValue(): number {
  const value = useContext(DeltaContext);
  if (value === null) {
    throw new Error('DeltaIcon and DeltaValue must be used inside <Delta>.');
  }
  return value;
}

function tone(value: number): 'pos' | 'neg' | 'zero' {
  if (value > 0) return 'pos';
  if (value < 0) return 'neg';
  return 'zero';
}

export function Delta({
  className,
  value,
  variant = 'default',
  children,
  ...props
}: ComponentProps<'span'> & { value: number; variant?: 'default' | 'badge' }) {
  const t = tone(value);
  if (variant === 'badge') {
    return (
      <DeltaContext.Provider value={value}>
        <Badge
          variant="secondary"
          className={cn(
            'gap-1 border-none font-medium tabular-nums [&_svg]:size-3.5',
            t === 'pos' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            t === 'neg' && 'bg-red-500/10 text-red-600 dark:text-red-400',
            t === 'zero' && 'bg-muted text-muted-foreground',
            className,
          )}
        >
          {children}
        </Badge>
      </DeltaContext.Provider>
    );
  }
  return (
    <DeltaContext.Provider value={value}>
      <span
        className={cn(
          'inline-flex items-center gap-1 tabular-nums [&_svg]:size-3 [&_svg]:shrink-0',
          t === 'pos' && 'text-emerald-600 dark:text-emerald-400',
          t === 'neg' && 'text-red-600 dark:text-red-400',
          t === 'zero' && 'text-muted-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </span>
    </DeltaContext.Provider>
  );
}

export function DeltaIcon({
  variant = 'default',
  className,
}: {
  variant?: 'default' | 'trend';
  className?: string;
}) {
  const value = useDeltaValue();
  if (value === 0) return <Minus className={className} aria-hidden="true" />;
  if (value > 0) {
    return variant === 'trend' ? (
      <TrendingUp className={className} aria-hidden="true" />
    ) : (
      <ChevronUp className={className} aria-hidden="true" />
    );
  }
  return variant === 'trend' ? (
    <TrendingDown className={className} aria-hidden="true" />
  ) : (
    <ChevronDown className={className} aria-hidden="true" />
  );
}

export function DeltaValue({
  className,
  precision = 1,
  suffix = '%',
  absolute = true,
}: {
  className?: string;
  precision?: number;
  suffix?: string;
  absolute?: boolean;
}) {
  const value = useDeltaValue();
  const formatted = (absolute ? Math.abs(value) : value).toFixed(precision);
  return (
    <span className={cn('tabular-nums', className)}>
      {formatted}
      {suffix}
    </span>
  );
}
