'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useActivity } from '@/lib/api/hooks';

const DAYS = 30;

const chartConfig = {
  count: { label: 'Actions', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** A short, UTC label for an axis tick / tooltip: `Mar 3`. The series is UTC-bucketed (F-084). */
function labelFor(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * The Overview activity chart (F-084; ADR-0053 clause 3) — workspace activity per day, from the audit
 * trail. Placed below the stat cards, above Recent activity.
 *
 * Honesty, three ways:
 * - **Renders only when there is data.** No trail history ⇒ `points` is empty ⇒ this returns `null`,
 *   so the Overview never shows a flat zero line for a workspace that has done nothing.
 * - **Labels the window the server actually used** (`from`), not the 30 days requested — the trail is
 *   pruned, and the server floors the series to its oldest event so a pruned day is never drawn as a
 *   zero.
 * - **UTC**, stated in the description: the buckets are UTC days, so the axis is too, rather than
 *   quietly shifting events across a local midnight.
 *
 * First consumer of `ui/chart.tsx`, so it uses the `--chart-*` tokens — theme-true in all 4 themes.
 */
export function ActivityChart() {
  const { data, isPending, isError } = useActivity(DAYS);

  // Never render an error or a zero-history workspace: this is an accent on the Overview, not a
  // surface that must explain its own absence. The stat cards already carry the load-bearing numbers.
  if (isError) return null;

  if (isPending) {
    return (
      <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
        <CardHeader className="p-0 pb-4">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="p-0">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const total = data.points.reduce((sum, point) => sum + point.count, 0);
  if (data.points.length === 0 || total === 0) return null;

  return (
    <Card className="bg-sidebar gap-0 border-none p-4 shadow-none dark:ring-0">
      <CardHeader className="p-0 pb-4">
        <CardTitle className="text-sm font-semibold">Activity</CardTitle>
        <CardDescription className="text-xs">
          Workspace actions per day (UTC), since {labelFor(data.from)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ChartContainer config={chartConfig} className="h-40 w-full">
          <AreaChart data={data.points as ActivityPoint[]} margin={{ left: -20, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={labelFor}
              className="text-[10px]"
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
              className="text-[10px]"
            />
            <ChartTooltip
              content={<ChartTooltipContent labelFormatter={(value) => labelFor(String(value))} />}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-count)"
              strokeWidth={2}
              fill="url(#activity-fill)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

interface ActivityPoint {
  date: string;
  count: number;
}
