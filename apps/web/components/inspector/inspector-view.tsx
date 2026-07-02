'use client';

import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ScoreBar } from '@/components/provenance/score-bar';
import { useCompile } from '@/lib/api/hooks';
import type { ContextPackage } from '@/lib/api/types';
import { Terminal } from 'lucide-react';

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
    <div className="space-y-4">
      <Card className="border-none bg-sidebar p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-3">
          <CardTitle>Context Package Compiler</CardTitle>
          <CardDescription>
            Compile a token-budget-bounded context package from files, graph edges, and memories
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <form onSubmit={submit} aria-label="Compile a context package">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-1.5">
                <label htmlFor="task" className="text-xs font-semibold text-foreground">
                  Task description
                </label>
                <Input
                  id="task"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  placeholder="e.g. Explain how retrieval fusion works"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="budget" className="text-xs font-semibold text-foreground">
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
                  className="w-32 h-9 text-xs"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="h-9 text-xs"
                disabled={compile.isPending || task.trim().length === 0}
              >
                <Terminal className="size-4" />
                Compile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
          title="Inspector Idle"
          description="Compile context for a task to see the fragments chosen, why each was included, and the full pipeline trace."
        />
      )}
    </div>
  );
}

function PackageView({ pkg }: { pkg: ContextPackage }) {
  return (
    <div className="space-y-4">
      <Card className="border-none bg-sidebar p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-sm font-semibold">Package scores</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <ScoreBar label="Budget adherence" value={pkg.scores.budgetAdherence} />
            <ScoreBar label="Provenance coverage" value={pkg.scores.provenanceCoverage} />
            <ScoreBar label="Redundancy" value={pkg.scores.redundancy} />
          </div>
          <div className="text-muted-foreground text-[10px] font-mono leading-none">
            <span className="text-foreground font-semibold tabular-nums">
              {pkg.scores.fragmentCount}
            </span>{' '}
            fragments ·{' '}
            <span className="text-foreground font-semibold tabular-nums">{pkg.totalTokens}</span> /{' '}
            {pkg.budget} tokens
          </div>
        </CardContent>
      </Card>

      {pkg.sections.map((section, idx) => (
        <Card
          className="border-none bg-sidebar p-4 shadow-none dark:ring-0"
          key={`${section.title}-${idx}`}
        >
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-sm font-semibold">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-4 flex flex-col gap-3">
            {section.fragments.map((fragment, fidx) => (
              <div
                key={`${fragment.ref}-${fidx}`}
                className="space-y-2 rounded-xl bg-background/30 border border-border/30 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[11px] font-medium break-all text-foreground">
                    {fragment.ref}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline" className="font-mono text-[9px] h-5 px-1.5 uppercase">
                      {fragment.kind}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[9px] h-5 px-1.5 tabular-nums"
                    >
                      {fragment.tokens} tok
                    </Badge>
                  </div>
                </div>

                <div className="bg-muted/40 rounded-lg px-2.5 py-1.5 text-[11px] leading-normal text-muted-foreground">
                  <span className="font-semibold text-foreground">Why included: </span>
                  {fragment.whyIncluded}
                </div>

                {fragment.text ? (
                  <pre className="text-muted-foreground/80 bg-background/20 rounded-lg p-2 font-mono text-[10px] whitespace-pre-wrap overflow-x-auto max-h-40 scrollbar-thin">
                    {fragment.text}
                  </pre>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/30">
                  {fragment.provenance.signals.map((signal) => (
                    <Badge
                      key={signal}
                      variant="outline"
                      className="font-mono text-[9px] h-5 px-1.5 font-normal"
                    >
                      {signal}
                    </Badge>
                  ))}
                  {fragment.provenance.expandedFrom ? (
                    <Badge
                      variant="outline"
                      className="font-mono text-[9px] h-5 px-1.5 font-normal"
                    >
                      ← {fragment.provenance.expandedFrom}
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums">
                    score {fragment.score.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="border-none bg-sidebar p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-sm font-semibold">Compilation trace</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-4 flex flex-col gap-3">
          {pkg.trace.stages.map((stage, index) => (
            <div key={stage.stage} className="space-y-1.5">
              {index > 0 ? <Separator className="mb-3" /> : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-foreground">{stage.stage}</span>
                <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                  {stage.inputCount} → {stage.outputCount}
                </span>
              </div>
              {stage.notes ? (
                <p className="text-muted-foreground text-[11px] leading-normal">{stage.notes}</p>
              ) : null}
              {stage.dropped.length > 0 ? (
                <ul className="mt-1.5 space-y-1 bg-background/20 rounded-lg p-2 font-mono text-[10px]">
                  {stage.dropped.map((drop, didx) => (
                    <li
                      key={`${drop.ref}-${didx}`}
                      className="text-muted-foreground flex flex-col sm:flex-row sm:justify-between gap-1"
                    >
                      <span className="break-all text-muted-foreground/80">{drop.ref}</span>
                      <span className="text-foreground/60 shrink-0">— {drop.reason}</span>
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
      <Card className="border-none bg-sidebar p-4 shadow-none dark:ring-0">
        <Skeleton className="h-10 w-1/3 mb-4" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </Card>
      <Card className="border-none bg-sidebar p-4 shadow-none dark:ring-0">
        <Skeleton className="h-28 w-full" />
      </Card>
    </div>
  );
}
