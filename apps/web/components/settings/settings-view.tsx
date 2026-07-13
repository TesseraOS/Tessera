'use client';

import Link from 'next/link';
import { Activity, ArrowUpRight, Check, Server, Wallet, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { ErrorState } from '@/components/error-state';
import { cn } from '@/lib/utils';
import { API_ORIGIN } from '@/lib/api/client';
import { useHealth, usePlans, useReady } from '@/lib/api/hooks';
import { formatNumber } from '@/lib/format';
import type { Plan } from '@/lib/api/types';

/** Format an entitlement limit; `-1` means unlimited (open-core convention). */
function limit(value: number): string {
  return value < 0 ? 'Unlimited' : formatNumber(value);
}

function price(plan: Plan): string {
  if (plan.priceCents === 0) return 'Free';
  const dollars = plan.priceCents / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}/${
    plan.interval === 'year' ? 'yr' : 'mo'
  }`;
}

/**
 * Settings (FR-46) — the deployment's health, budgets, and governance posture, rendered read-only
 * from the API. Where the API exposes no write surface, the UI shows the current state and says so —
 * it never renders a fake control (ADR-0022).
 */
export function SettingsView() {
  return (
    <div className="space-y-4">
      <AppearanceSettings />
      <DeploymentCard />
      <PlansCard />
      <GovernanceCard />
    </div>
  );
}

function DeploymentCard() {
  const health = useHealth();
  const ready = useReady();

  const live = health.data?.status === 'ok';
  const isReady = ready.data?.status === 'ready';
  const checks = ready.data?.checks ?? [];

  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-3">
        <Server className="text-muted-foreground size-4" aria-hidden="true" />
        <div className="space-y-1">
          <CardTitle className="text-sm">Deployment</CardTitle>
          <CardDescription>
            Live connection and dependency health for this workspace.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-muted-foreground text-[11px]">API endpoint</dt>
            <dd className="text-foreground truncate font-mono text-xs" title={API_ORIGIN}>
              {API_ORIGIN}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-[11px]">Liveness</dt>
            <dd>
              {health.isPending ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <StatusBadge ok={live} okLabel="Live" badLabel="Unreachable" />
              )}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground text-[11px]">Readiness</dt>
            <dd>
              {ready.isPending ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <StatusBadge ok={isReady} okLabel="Ready" badLabel="Not ready" />
              )}
            </dd>
          </div>
        </dl>

        {checks.length > 0 ? (
          <div className="border-border/60 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-xs">Dependency</TableHead>
                  <TableHead className="h-8 text-xs">Detail</TableHead>
                  <TableHead className="h-8 text-right text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((check) => (
                  <TableRow key={check.name}>
                    <TableCell className="text-foreground py-2 font-mono text-xs capitalize">
                      {check.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-2 text-xs">
                      {check.detail ?? '—'}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <StatusBadge ok={check.ok} okLabel="OK" badLabel="Down" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PlansCard() {
  const { data, isPending, isError, error, refetch } = usePlans();
  const plans = data?.plans ?? [];

  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-3">
        <Wallet className="text-muted-foreground size-4" aria-hidden="true" />
        <div className="space-y-1">
          <CardTitle className="text-sm">Plans &amp; budgets</CardTitle>
          <CardDescription>
            Entitlements that bound compilation. The compile-token budget is enforced server-side
            per plan.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            title="Could not load plans"
            description={error instanceof Error ? error.message : 'Is the Tessera API running?'}
            onRetry={() => void refetch()}
          />
        ) : isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="border-border/60 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-xs">Plan</TableHead>
                  <TableHead className="h-8 text-xs">Price</TableHead>
                  <TableHead className="h-8 text-right text-xs">Compile budget</TableHead>
                  <TableHead className="h-8 text-right text-xs">Monthly compiles</TableHead>
                  <TableHead className="h-8 text-right text-xs">Seats</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="text-foreground py-2 text-xs font-medium">
                      {plan.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-2 text-xs">
                      {price(plan)}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-2 text-right font-mono text-xs tabular-nums">
                      {limit(plan.entitlements.maxTokensPerCompile)}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-2 text-right font-mono text-xs tabular-nums">
                      {limit(plan.entitlements.maxMonthlyCompiles)}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-2 text-right font-mono text-xs tabular-nums">
                      {limit(plan.entitlements.maxSeats)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GovernanceCard() {
  return (
    <Card className="bg-sidebar border-none p-4 shadow-none dark:ring-0">
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-0 pb-2">
        <Activity className="text-muted-foreground size-4" aria-hidden="true" />
        <CardTitle className="text-sm">Governance &amp; retention</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-3 p-0 text-xs leading-relaxed">
        <p>
          Access is enforced by role-based permissions (least privilege), and every sensitive action
          is recorded in an <span className="text-foreground font-medium">append-only</span>,
          per-tenant audit trail with a server-side retention policy (max age / max entries,
          NFR-13). These are managed server-side by configuration — there are no client-side
          controls.
        </p>
        <Link
          href="/governance"
          className="text-foreground inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          View roles &amp; retention posture
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 gap-1 text-[10px] font-medium',
        ok
          ? 'border-emerald-600/30 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-500'
          : 'border-destructive/40 text-destructive',
      )}
    >
      {ok ? (
        <Check className="size-3" aria-hidden="true" />
      ) : (
        <X className="size-3" aria-hidden="true" />
      )}
      {ok ? okLabel : badLabel}
    </Badge>
  );
}
