'use client';

import { Terminal } from 'lucide-react';
import type { FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CONTEXT_FRAGMENT_KINDS, type ContextFragmentKind } from '@/lib/api/types';

/**
 * Budget presets, grounded in the real plan caps (`@tessera/billing`: free 8,000 / pro 32,000) and
 * the compiler's own default. Anything above the caller's plan is clamped by the API — and the
 * Inspector *says so* (see `ClampNotice`) rather than hiding it or disabling the option.
 */
const BUDGET_PRESETS = [2000, 8000, 32000] as const;

export interface CompileFormValues {
  task: string;
  budget: number;
  kinds: ContextFragmentKind[];
}

/**
 * The compile form (F-062): task, budget with presets, and the kind filters that already existed on
 * the wire but were never surfaced.
 *
 * **The `Token budget` input stays a labelled, fillable number field.** `tests/e2e-full` drives this
 * form against a live deployment with `getByLabel('Token budget').fill('2000')` — presets *set* the
 * same controlled state, they do not replace the control (golden rule 6).
 */
export function CompileForm({
  values,
  onChange,
  onSubmit,
  pending,
}: {
  values: CompileFormValues;
  onChange: (next: CompileFormValues) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const toggleKind = (kind: ContextFragmentKind) =>
    onChange({
      ...values,
      kinds: values.kinds.includes(kind)
        ? values.kinds.filter((k) => k !== kind)
        : [...values.kinds, kind],
    });

  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
      <CardHeader className="p-0 pb-3">
        <CardTitle>Context Package Compiler</CardTitle>
        <CardDescription>
          Compile a token-budget-bounded context package from files, graph edges, and memories
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pt-4">
        <form onSubmit={submit} aria-label="Compile a context package" className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="task" className="text-foreground text-xs font-semibold">
                Task description
              </label>
              <Input
                id="task"
                value={values.task}
                onChange={(event) => onChange({ ...values, task: event.target.value })}
                placeholder="e.g. Explain how retrieval fusion works"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="budget" className="text-foreground text-xs font-semibold">
                Token budget
              </label>
              <Input
                id="budget"
                type="number"
                min={1}
                value={values.budget}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  onChange({ ...values, budget: Number.isFinite(next) ? next : 0 });
                }}
                className="h-9 w-32 text-xs"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="h-9 text-xs"
              disabled={pending || values.task.trim().length === 0}
            >
              <Terminal className="size-4" />
              Compile
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="group" aria-label="Budget presets" className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px]">Presets</span>
              {BUDGET_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={values.budget === preset ? 'secondary' : 'outline'}
                  aria-pressed={values.budget === preset}
                  className="h-7 text-[11px] tabular-nums"
                  onClick={() => onChange({ ...values, budget: preset })}
                >
                  {preset.toLocaleString()}
                </Button>
              ))}
            </div>

            <div role="group" aria-label="Restrict to kinds" className="flex items-center gap-1.5">
              {/* Honest label: the filter is applied AFTER retrieval, so it narrows what was already
                  retrieved rather than fetching more of the chosen kind. Which is also why it can
                  legitimately empty a package — see the guidance state. */}
              <span className="text-muted-foreground text-[11px]">Restrict to</span>
              {CONTEXT_FRAGMENT_KINDS.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant={values.kinds.includes(kind) ? 'secondary' : 'outline'}
                  aria-pressed={values.kinds.includes(kind)}
                  className="h-7 text-[11px]"
                  onClick={() => toggleKind(kind)}
                >
                  {kind}
                </Button>
              ))}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Say when the plan capped the compile (F-062, acceptance 3).
 *
 * **Derived, not told.** The API clamps silently (`clampBudgetToPlan`) — but the returned
 * `pkg.budget` *is* the effective budget, and the client knows what it asked for, so
 * `requested > effective` ⟺ clamped. No additive response field, no SDK regen, no tokens on the wire
 * to tell a caller something it can already compute.
 *
 * **The copy is scoped to THIS compile on purpose.** "Your plan caps compiles at 8,000" would be
 * false while the MCP surface ignores the clamp entirely (F-077), and a non-admin cannot read their
 * own plan name anyway (`/v1/billing/subscription` requires `admin:manage`). What happened to this
 * compile is provable from the response and stays true whichever way F-077 is decided.
 *
 * This is a notice, not an error: the compile succeeded and the package is valid.
 */
export function ClampNotice({ requested, effective }: { requested: number; effective: number }) {
  if (!(effective < requested)) return null;

  return (
    <div
      role="status"
      className="border-border/60 bg-muted/40 text-muted-foreground flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
    >
      <Badge variant="outline" className="h-5 text-[10px]">
        Capped
      </Badge>
      <span>
        Compiled with{' '}
        <span className="text-foreground font-semibold tabular-nums">
          {effective.toLocaleString()}
        </span>{' '}
        tokens — you requested{' '}
        <span className="text-foreground font-semibold tabular-nums">
          {requested.toLocaleString()}
        </span>
        . Your plan limits a single compile.
      </span>
    </div>
  );
}
