'use client';

import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRecentCompiles, type RecentCompile } from '@/lib/store/recent-compiles';

/**
 * Tasks compiled in this session, so one can be re-run without retyping (F-062).
 *
 * **Session-local, and the copy says so.** These are the tasks from this tab; a reload starts empty
 * (see `lib/store/recent-compiles` for why persisting them is a feature, not a middleware call).
 * Clicking one **prefills and submits** — it never fires on mount, because a compile spends budget
 * and is entitlement-clamped.
 */
export function RecentCompiles({ onRerun }: { onRerun: (entry: RecentCompile) => void }) {
  const entries = useRecentCompiles((state) => state.entries);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        <History className="size-3" aria-hidden="true" />
        This session
      </h3>
      <ul className="flex flex-wrap gap-1.5" aria-label="Recent compiles">
        {entries.map((entry) => (
          <li key={entry.task}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 max-w-[22rem] text-[11px]"
              onClick={() => onRerun(entry)}
            >
              <span className="truncate">{entry.task}</span>
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px] tabular-nums">
                {entry.budget.toLocaleString()}
              </Badge>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
