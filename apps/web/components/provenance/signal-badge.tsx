'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SignalContribution } from '@/lib/api/types';
import { cn } from '@/lib/utils';

// A subtle categorical cue per retrieval signal, using the design-system --chart-* palette.
const SIGNAL_DOT: Record<string, string> = {
  semantic: 'bg-chart-1',
  keyword: 'bg-chart-2',
  graph: 'bg-chart-3',
  symbolic: 'bg-chart-4',
  temporal: 'bg-chart-5',
};

/** Provenance chip: which retrieval signal surfaced a result, with its rank/score/weight on hover. */
export function SignalBadge({ signal }: { signal: SignalContribution }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1.5 font-normal">
          <span
            className={cn(
              'size-1.5 rounded-full',
              SIGNAL_DOT[signal.signal] ?? 'bg-muted-foreground',
            )}
            aria-hidden="true"
          />
          {signal.signal}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5 font-mono text-xs">
          <div>rank #{signal.rank}</div>
          <div>score {signal.score.toFixed(3)}</div>
          <div>
            weight {signal.weight.toFixed(2)} · contribution {signal.contribution.toFixed(3)}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
