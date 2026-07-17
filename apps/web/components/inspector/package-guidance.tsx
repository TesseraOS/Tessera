'use client';

import { ArrowRight, Boxes, FilterX, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mascot } from '@tessera/mascot';
import type { EmptyPackageDiagnosis } from '@/lib/inspector/diagnose';

/**
 * What the Inspector shows instead of scores when a compile produced nothing (F-062).
 *
 * The 2026-07-04 live review compiled against an empty corpus and got "Budget adherence 100% ·
 * Provenance coverage 100% · Redundancy 0% · 0 fragments" — three full progress bars announcing a
 * success that had not happened. This replaces the celebration with a reason and, where the data
 * supports one, a next step. Where it does not, there is no button: a guess dressed as a
 * recommendation sends people to fix the wrong thing.
 */
export function PackageGuidance({
  diagnosis,
  onClearFilters,
  onRaiseBudget,
}: {
  diagnosis: EmptyPackageDiagnosis;
  onClearFilters: () => void;
  onRaiseBudget: () => void;
}) {
  return (
    <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
      <CardContent className="flex flex-col items-center gap-4 p-0 py-8 text-center">
        <Mascot mood="searching" size={92} />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{diagnosis.title}</p>
          <p className="text-muted-foreground mx-auto max-w-md text-xs leading-relaxed">
            {diagnosis.description}
          </p>
        </div>
        {diagnosis.action ? (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {diagnosis.action.kind === 'sources' ? (
              <Button asChild size="sm">
                <a href="/sources">
                  <Boxes className="size-4" />
                  Connect a source
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            ) : diagnosis.action.kind === 'clear-filters' ? (
              <Button size="sm" onClick={onClearFilters}>
                <FilterX className="size-4" />
                Clear filters and retry
              </Button>
            ) : (
              <Button size="sm" onClick={onRaiseBudget}>
                <Gauge className="size-4" />
                Raise the budget and retry
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
