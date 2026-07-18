'use client';

import { Area, AreaChart, XAxis } from 'recharts';
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

/**
 * The single series rides `--primary`, not `--chart-1` (F-091, user item 5): a one-series trend
 * should carry the theme's own accent — monochrome in Monkai (the documented "monochrome chart
 * ramp" of DESIGN-SYSTEM §0.1), amber/terracotta/ink in the catalog themes. `--chart-1..5` is the
 * *categorical* palette (graph kind accents, signal badges, memory kinds, the art layer) and its
 * dark-mode stock blue has no business on this neutral surface.
 */
const chartConfig = {
  count: { label: 'Actions', color: 'var(--primary)' },
} satisfies ChartConfig;

/**
 * A short label for a `YYYY-MM-DD` bucket day: `Mar 3`. The buckets are the **viewer's** calendar
 * days (F-088 — the server shifted them by this browser's own offset), so the day is formatted as a
 * plain local calendar date, no timezone gymnastics.
 */
function labelFor(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined || !year || !month || !day) {
    return date;
  }
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
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
 * - **The viewer's days, honestly bucketed** (F-088): the browser's UTC offset is sent with the
 *   request and the server aggregates in that frame — evening work lands on the day the viewer
 *   experienced, not on UTC's tomorrow.
 *
 * Axis-free by design (F-088, user item 3): no x/y axes, no grid — the trend is the message, and the
 * tooltip carries the exact per-day values on demand. The hidden `XAxis` stays mounted only so the
 * tooltip label resolves to the bucket day.
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
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-0 pb-4">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold">Activity</CardTitle>
          <CardDescription className="text-xs">
            Workspace actions per day, since {labelFor(data.from)}.
          </CardDescription>
        </div>
        {/* The window total — the one number the trend line cannot carry by itself. */}
        <div className="shrink-0 text-right">
          <p className="text-sm leading-5 font-semibold tabular-nums">{total.toLocaleString()}</p>
          <p className="text-muted-foreground text-[11px]">total actions</p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ChartContainer config={chartConfig} className="h-40 w-full">
          {/*
            The margins are clipping headroom, not decoration: recharts clips the plot to its
            viewBox, so with zero margins half the 2px stroke — and the whole hover dot — vanished
            at the first/last day and at the window's peak (F-091, user item 5).
          */}
          <AreaChart
            data={data.points as ActivityPoint[]}
            margin={{ top: 6, right: 6, bottom: 6, left: 6 }}
          >
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {/* Hidden, not removed: it anchors the tooltip's label to the bucket day (item 3). */}
            <XAxis dataKey="date" hide />
            <ChartTooltip
              content={<ChartTooltipContent labelFormatter={(value) => labelFor(String(value))} />}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-count)"
              strokeWidth={2}
              fill="url(#activity-fill)"
              activeDot={{
                r: 3.5,
                strokeWidth: 2,
                // Punched out of the card's own ground, so the dot reads on every theme × mode.
                stroke: 'var(--sidebar)',
                fill: 'var(--color-count)',
              }}
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
