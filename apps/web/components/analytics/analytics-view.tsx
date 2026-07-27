'use client';

import { Area, AreaChart, XAxis } from 'recharts';
import { ChartNoAxesCombined } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { useUsage } from '@/lib/api/hooks';

/**
 * Analytics (FR-47; F-057) — what this workspace actually spent, how fast it answered, and how well
 * the retriever did, from the durable usage store (`GET /v1/usage`).
 *
 * **Three things this view deliberately does not say**, because the system cannot prove them:
 *
 * 1. **No percentiles.** The store holds a count, a duration sum and a max, and a sum and a max
 *    cannot produce a p95 (ADR-0060 §3). The labels are "average" and "slowest" and mean exactly
 *    that. Real percentiles are measured offline by the gated `bench` suite against NFR-4.
 * 2. **No money.** The only currency in the system is a plan's list price. There is no per-token
 *    price and no provider bill, so a dollar figure here would be invented — which DESIGN-SYSTEM §0
 *    forbids. "Cost posture" is what remains provable: tokens compiled, usage against the plan, and
 *    what Tessera itself bills. It cannot name the embeddings provider either — nothing on the API
 *    exposes it (F-097) — so it does not claim to.
 * 3. **UTC days, said out loud.** These buckets are pre-aggregated at write time and cannot be
 *    re-split, so unlike the Overview chart (viewer-local, F-088) this axis is UTC. Two day
 *    boundaries in one product is confusing *unless it is stated*, so it is stated.
 */

const WINDOW_DAYS = 30;

/** The single series rides `--primary`, not `--chart-1` (the F-091 rule recorded on E-004). */
const chartConfig = {
  compiles: { label: 'Compiles', color: 'var(--primary)' },
} satisfies ChartConfig;

/** `2026-05-04` → `May 4`. Parsed as UTC, because these buckets ARE UTC (unlike F-088's). */
function labelFor(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

interface MetricProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

/** One number with its label and, where the number needs it, the caveat that makes it honest. */
function Metric({ label, value, hint }: MetricProps) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl leading-6 font-semibold tabular-nums">{value}</p>
      {hint !== undefined ? <p className="text-muted-foreground text-[11px]">{hint}</p> : null}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
        <Skeleton className="h-40 w-full" />
      </Card>
    </div>
  );
}

export function AnalyticsView() {
  const { data, isPending, isError, refetch } = useUsage(WINDOW_DAYS);

  if (isPending) return <AnalyticsSkeleton />;

  if (isError || data === undefined) {
    return (
      <ErrorState
        title="Couldn't load usage"
        description="Usage is served by the API and requires an admin token."
        onRetry={() => void refetch()}
      />
    );
  }

  const { totals, latency, quality, entitlement, daily } = data;
  const hasUsage =
    totals.compiles > 0 ||
    totals.searches > 0 ||
    totals.documentsIngested > 0 ||
    totals.memoriesWritten > 0;

  // A dedicated page cannot return `null` the way the Overview's accent chart does, so it says so
  // plainly instead of drawing a flat zero line for a workspace that has done nothing yet.
  if (!hasUsage) {
    return (
      <EmptyState
        icon={ChartNoAxesCombined}
        title="No usage recorded yet"
        description="Compile some context or run a search, and this workspace's usage will show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-4">
          <CardTitle>Usage</CardTitle>
          <CardDescription>
            Since {labelFor(data.from)} (UTC days). This is the window the server actually holds
            data for, not the {WINDOW_DAYS} days requested.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Compiles" value={totals.compiles.toLocaleString()} />
          <Metric label="Searches" value={totals.searches.toLocaleString()} />
          <Metric label="Documents ingested" value={totals.documentsIngested.toLocaleString()} />
          <Metric label="Tokens compiled" value={totals.tokensCompiled.toLocaleString()} />
        </CardContent>
      </Card>

      {/*
        TWO days, not one. Found by looking at it: a one-day window renders a single dot marooned in
        an empty 40px box, which reads as a broken chart rather than as a young workspace. A trend
        needs two points to be a trend, and the day's total is already the number in the card above.
        Same principle as the Overview chart's refusal to draw a flat zero line (F-084).
      */}
      {daily.length > 1 ? (
        <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-sm font-semibold">Compiles per day</CardTitle>
            <CardDescription className="text-xs">UTC calendar days.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ChartContainer config={chartConfig} className="h-40 w-full">
              {/* Margins are clipping headroom, not decoration — recharts clips to its viewBox and
                  a zero-margin plot loses half the stroke and the whole hover dot (F-091). */}
              <AreaChart data={[...daily]} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                <defs>
                  <linearGradient id="usage-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-compiles)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-compiles)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                {/* Hidden, not removed: it anchors the tooltip label to the bucket day. */}
                <XAxis dataKey="date" hide />
                <ChartTooltip
                  content={
                    <ChartTooltipContent labelFormatter={(value) => labelFor(String(value))} />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="compiles"
                  stroke="var(--color-compiles)"
                  strokeWidth={2}
                  fill="url(#usage-fill)"
                  activeDot={{
                    r: 3.5,
                    strokeWidth: 2,
                    stroke: 'var(--sidebar)',
                    fill: 'var(--color-compiles)',
                  }}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
          <CardHeader className="p-0 pb-4">
            <CardTitle>Latency</CardTitle>
            <CardDescription>
              Measured at the API and MCP boundaries. These are a mean and a maximum &mdash; not
              percentiles.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 p-0 sm:grid-cols-2">
            {latency.compile !== null ? (
              <>
                <Metric label="Compile, average" value={formatMs(latency.compile.avgMs)} />
                <Metric label="Compile, slowest" value={formatMs(latency.compile.maxMs)} />
              </>
            ) : (
              <Metric label="Compile" value="—" hint="No compile in this window." />
            )}
            {latency.search !== null ? (
              <>
                <Metric label="Search, average" value={formatMs(latency.search.avgMs)} />
                <Metric label="Search, slowest" value={formatMs(latency.search.maxMs)} />
              </>
            ) : (
              <Metric label="Search" value="—" hint="No search in this window." />
            )}
          </CardContent>
        </Card>

        <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
          <CardHeader className="p-0 pb-4">
            <CardTitle>Retrieval quality</CardTitle>
            <CardDescription>
              Averaged over compiles that carried scores &mdash; the compiler&rsquo;s own measures
              of how well a package used its budget and how much of it was provenance-tagged.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 p-0 sm:grid-cols-2">
            {quality !== null ? (
              <>
                <Metric
                  label="Budget adherence"
                  value={formatPercent(quality.avgBudgetAdherence)}
                  hint="How fully each package used the budget it was given."
                />
                <Metric
                  label="Provenance coverage"
                  value={formatPercent(quality.avgProvenanceCoverage)}
                  hint="Share of fragments carrying a source attribution."
                />
              </>
            ) : (
              <Metric
                label="Quality"
                value="—"
                hint="No compile in this window carried scores, so there is no average to report."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-4">
          <CardTitle>Cost posture</CardTitle>
          <CardDescription>
            What this workspace spends, in the only terms Tessera can actually account for.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 p-0 sm:grid-cols-3">
          <Metric
            label="Tokens compiled"
            value={totals.tokensCompiled.toLocaleString()}
            hint="Context tokens assembled in this window."
          />
          {entitlement !== null ? (
            <Metric
              label="Compiles this month"
              value={
                entitlement.maxMonthlyCompiles < 0
                  ? `${entitlement.compilesUsed.toLocaleString()} / unlimited`
                  : `${entitlement.compilesUsed.toLocaleString()} / ${entitlement.maxMonthlyCompiles.toLocaleString()}`
              }
              hint="Against this tenant's plan entitlement, across every project."
            />
          ) : (
            <Metric
              label="Metering"
              value="Off"
              hint="This deployment is self-hosted and unmetered, so there is no entitlement to report."
            />
          )}
          {/*
            NOT "Embedding spend: None". The dashboard cannot know which embeddings provider this
            deployment runs — nothing on the API exposes `config.embeddings.provider` (verified) — so
            asserting zero API spend would be false for anyone using a hosted provider. What IS true
            regardless is what Tessera itself bills, so that is what this says. Naming the provider
            needs a new field on a read endpoint; tracked as F-097.
          */}
          <Metric
            label="Billed by Tessera"
            value={entitlement !== null ? 'Your plan' : 'Nothing'}
            hint="Tessera makes no metered API calls of its own. A hosted embeddings or LLM provider, if you configured one, bills you directly."
          />
        </CardContent>
      </Card>
    </div>
  );
}
