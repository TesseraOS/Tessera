'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { CompilerAssembly } from '@/components/art';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ScoreBar } from '@/components/provenance/score-bar';
import {
  ClampNotice,
  CompileForm,
  type CompileFormValues,
} from '@/components/inspector/compile-form';
import { FragmentCard } from '@/components/inspector/fragment-card';
import { PackageExport } from '@/components/inspector/package-export';
import { PackageGuidance } from '@/components/inspector/package-guidance';
import { RecentCompiles } from '@/components/inspector/recent-compiles';
import { useCompile, useStats } from '@/lib/api/hooks';
import { diagnoseEmptyPackage } from '@/lib/inspector/diagnose';
import { useRecentCompiles } from '@/lib/store/recent-compiles';
import type { WorkspaceStats } from '@/lib/api/client';
import type { ContextFragmentKind, ContextPackage } from '@/lib/api/types';

const DEFAULT_BUDGET = 2000;

/** Context Package Inspector (FR-44) — the provenance-first flagship: what was chosen, why, how. */
export function InspectorView() {
  // Seeded from `?task=` when arriving from a search result (F-061). PREFILL ONLY — it deliberately
  // does not auto-compile: a compile spends budget and is entitlement-clamped, so firing one from a
  // navigation would surprise the user and burn quota they never chose to spend.
  const searchParams = useSearchParams();
  const [values, setValues] = useState<CompileFormValues>(() => ({
    task: searchParams.get('task') ?? '',
    budget: DEFAULT_BUDGET,
    kinds: [],
  }));

  const compile = useCompile();
  const remember = useRecentCompiles((state) => state.remember);

  // Progressive enhancement for the empty-package guidance ONLY — never gates the Inspector. A token
  // without `stats:read` 403s here and the diagnosis falls back to what the trace alone proves.
  const { data: stats } = useStats();

  const run = useCallback(
    (next: CompileFormValues) => {
      const task = next.task.trim();
      if (task.length === 0 || next.budget < 1) return;
      compile.mutate({
        task,
        budget: next.budget,
        ...(next.kinds.length > 0 ? { filters: { kinds: next.kinds } } : {}),
      });
    },
    [compile],
  );

  // Remember a task once its compile lands — not on submit, so a failed compile does not pollute the
  // list with something that never produced a package.
  useEffect(() => {
    if (compile.data === undefined || compile.variables === undefined) return;
    const kinds = compile.variables.filters?.kinds;
    remember({
      task: compile.variables.task,
      budget: compile.variables.budget,
      ...(kinds !== undefined && kinds.length > 0 ? { kinds } : {}),
    });
  }, [compile.data, compile.variables, remember]);

  const requested = compile.variables?.budget;
  const filtersApplied = (compile.variables?.filters?.kinds?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <CompileForm
        values={values}
        onChange={setValues}
        onSubmit={() => run(values)}
        pending={compile.isPending}
      />

      <RecentCompiles
        onRerun={(entry) => {
          const next: CompileFormValues = {
            task: entry.task,
            budget: entry.budget,
            kinds: [...(entry.kinds ?? [])] as ContextFragmentKind[],
          };
          setValues(next);
          run(next);
        }}
      />

      {compile.isPending ? (
        <InspectorSkeleton />
      ) : compile.isError ? (
        <ErrorState
          mascot
          title="Compilation failed"
          description={compile.error instanceof Error ? compile.error.message : 'Unknown error'}
          onRetry={() => run(values)}
        />
      ) : compile.data ? (
        <>
          {requested !== undefined ? (
            <ClampNotice requested={requested} effective={compile.data.budget} />
          ) : null}
          <PackageView
            pkg={compile.data}
            stats={stats}
            filtersApplied={filtersApplied}
            onClearFilters={() => {
              const next = { ...values, kinds: [] };
              setValues(next);
              run(next);
            }}
            onRaiseBudget={() => {
              const next = { ...values, budget: Math.max(values.budget * 4, 8000) };
              setValues(next);
              run(next);
            }}
          />
        </>
      ) : (
        <EmptyState
          art={<CompilerAssembly />}
          title="Inspector idle"
          description="Compile context for a task to see the fragments chosen, why each was included, and the full pipeline trace."
        />
      )}
    </div>
  );
}

function PackageView({
  pkg,
  stats,
  filtersApplied,
  onClearFilters,
  onRaiseBudget,
}: {
  pkg: ContextPackage;
  stats: WorkspaceStats | undefined;
  filtersApplied: boolean;
  onClearFilters: () => void;
  onRaiseBudget: () => void;
}) {
  const diagnosis = diagnoseEmptyPackage(pkg, { stats, filtersApplied });

  return (
    <div className="space-y-4">
      {/* The scores render ONLY for a package with fragments. `computePackageScores([], …)` returns
          budgetAdherence 1 / provenanceCoverage 1 / redundancy 0 — every one a defensible vacuous
          truth, and together a lie: three full bars announcing a success that did not happen. The
          arithmetic is not wrong, so the fix is here rather than in the compiler; what is wrong is
          celebrating a vacuous truth. */}
      {diagnosis ? (
        <PackageGuidance
          diagnosis={diagnosis}
          onClearFilters={onClearFilters}
          onRaiseBudget={onRaiseBudget}
        />
      ) : (
        <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-0 pb-3">
            <CardTitle className="text-sm font-semibold">Package scores</CardTitle>
            <PackageExport pkg={pkg} />
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-0 pt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <ScoreBar label="Budget adherence" value={pkg.scores.budgetAdherence} />
              <ScoreBar label="Provenance coverage" value={pkg.scores.provenanceCoverage} />
              <ScoreBar label="Redundancy" value={pkg.scores.redundancy} />
            </div>
            <div className="text-muted-foreground font-mono text-[10px] leading-none">
              <span className="text-foreground font-semibold tabular-nums">
                {pkg.scores.fragmentCount}
              </span>{' '}
              fragment{pkg.scores.fragmentCount === 1 ? '' : 's'} ·{' '}
              <span className="text-foreground font-semibold tabular-nums">{pkg.totalTokens}</span>{' '}
              / {pkg.budget} tokens
            </div>
          </CardContent>
        </Card>
      )}

      {pkg.sections.map((section, idx) => (
        <Card
          className="bg-sidebar border-none p-4 shadow-none dark:ring-0"
          key={`${section.title}-${idx}`}
        >
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-sm font-semibold">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-0 pt-4">
            {section.fragments.map((fragment, fidx) => (
              <FragmentCard key={`${fragment.ref}-${fidx}`} fragment={fragment} />
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-sm font-semibold">Compilation trace</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-0 pt-4">
          {pkg.trace.stages.map((stage, index) => (
            <div key={stage.stage} className="space-y-1.5">
              {index > 0 ? <Separator className="mb-3" /> : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-foreground text-xs font-semibold">{stage.stage}</span>
                <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                  {stage.inputCount} → {stage.outputCount}
                </span>
              </div>
              {stage.notes ? (
                <p className="text-muted-foreground text-[11px] leading-normal">{stage.notes}</p>
              ) : null}
              {stage.dropped.length > 0 ? (
                <ul className="bg-background/20 mt-1.5 space-y-1 rounded-lg p-2 font-mono text-[10px]">
                  {stage.dropped.map((drop, didx) => (
                    <li
                      key={`${drop.ref}-${didx}`}
                      className="text-muted-foreground flex flex-col gap-1 sm:flex-row sm:justify-between"
                    >
                      <span className="text-muted-foreground break-all">{drop.ref}</span>
                      <span className="text-foreground/80 shrink-0">— {drop.reason}</span>
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
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <Skeleton className="mb-4 h-10 w-1/3" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </Card>
      <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
        <Skeleton className="h-28 w-full" />
      </Card>
    </div>
  );
}
