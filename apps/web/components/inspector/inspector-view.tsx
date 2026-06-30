'use client';

import { useState, type FormEvent } from 'react';
import { FileSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ScoreBar } from '@/components/provenance/score-bar';
import { useCompile } from '@/lib/api/hooks';
import type { ContextPackage } from '@/lib/api/types';

const DEFAULT_BUDGET = 2000;

/** Context Package Inspector (FR-44) — the provenance-first flagship: what was chosen, why, how. */
export function InspectorView() {
  const [task, setTask] = useState('');
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const compile = useCompile();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = task.trim();
    if (trimmed.length === 0 || budget < 1) return;
    compile.mutate({ task: trimmed, budget });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} aria-label="Compile a context package">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-1.5">
            <label htmlFor="task" className="text-sm font-medium">
              Task
            </label>
            <Input
              id="task"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="e.g. Explain how retrieval fusion works"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="budget" className="text-sm font-medium">
              Token budget
            </label>
            <Input
              id="budget"
              type="number"
              min={1}
              value={budget}
              onChange={(event) => {
                const next = Number(event.target.value);
                setBudget(Number.isFinite(next) ? next : 0);
              }}
              className="w-32"
            />
          </div>
          <Button type="submit" disabled={compile.isPending || task.trim().length === 0}>
            Compile
          </Button>
        </div>
      </form>

      {compile.isPending ? (
        <InspectorSkeleton />
      ) : compile.isError ? (
        <ErrorState
          title="Compilation failed"
          description={compile.error instanceof Error ? compile.error.message : 'Unknown error'}
          onRetry={() => {
            const trimmed = task.trim();
            if (trimmed.length > 0 && budget >= 1) compile.mutate({ task: trimmed, budget });
          }}
        />
      ) : compile.data ? (
        <PackageView pkg={compile.data} />
      ) : (
        <EmptyState
          icon={FileSearch}
          title="Inspect a Context Package"
          description="Compile context for a task to see the fragments chosen, why each was included, and the full pipeline trace."
        />
      )}
    </div>
  );
}

function PackageView({ pkg }: { pkg: ContextPackage }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Package scores</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ScoreBar label="Budget adherence" value={pkg.scores.budgetAdherence} />
          <ScoreBar label="Provenance coverage" value={pkg.scores.provenanceCoverage} />
          <ScoreBar label="Redundancy" value={pkg.scores.redundancy} />
          <div className="text-muted-foreground text-xs">
            <span className="text-foreground font-mono tabular-nums">
              {pkg.scores.fragmentCount}
            </span>{' '}
            fragments ·{' '}
            <span className="text-foreground font-mono tabular-nums">{pkg.totalTokens}</span> /{' '}
            {pkg.budget} tokens
          </div>
        </CardContent>
      </Card>

      {pkg.sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.fragments.map((fragment) => (
              <div key={fragment.ref} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-sm break-all">{fragment.ref}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline">{fragment.kind}</Badge>
                    <Badge variant="secondary" className="tabular-nums">
                      {fragment.tokens} tok
                    </Badge>
                  </div>
                </div>

                <p className="bg-muted/50 rounded px-2 py-1.5 text-sm">
                  <span className="font-medium">Why included: </span>
                  {fragment.whyIncluded}
                </p>

                {fragment.text ? (
                  <pre className="text-muted-foreground line-clamp-3 font-mono text-xs whitespace-pre-wrap">
                    {fragment.text}
                  </pre>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5">
                  {fragment.provenance.signals.map((signal) => (
                    <Badge key={signal} variant="outline" className="font-normal">
                      {signal}
                    </Badge>
                  ))}
                  {fragment.provenance.expandedFrom ? (
                    <Badge variant="outline" className="font-normal">
                      ← {fragment.provenance.expandedFrom}
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
                    score {fragment.score.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compilation trace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pkg.trace.stages.map((stage, index) => (
            <div key={stage.stage}>
              {index > 0 ? <Separator className="mb-3" /> : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{stage.stage}</span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {stage.inputCount} → {stage.outputCount}
                </span>
              </div>
              {stage.notes ? (
                <p className="text-muted-foreground mt-1 text-xs">{stage.notes}</p>
              ) : null}
              {stage.dropped.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {stage.dropped.map((drop) => (
                    <li key={drop.ref} className="text-muted-foreground text-xs">
                      <span className="font-mono break-all">{drop.ref}</span> — {drop.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function InspectorSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
