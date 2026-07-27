import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getUsage = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getUsage },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// Same reasoning as the ActivityChart suite: recharts needs real layout, and its rendering is
// third-party — verified by the F-057 screenshots, not here. Stub it so these tests exercise THIS
// component's logic: the honest empty/error states and the labels that must never say "p95".
vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));
vi.mock('recharts', () => {
  const Noop = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { AreaChart: Noop, Area: Noop, CartesianGrid: Noop, XAxis: Noop, YAxis: Noop };
});

import { AnalyticsView } from '@/components/analytics/analytics-view';

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnalyticsView />
    </QueryClientProvider>,
  );
}

interface UsageOverrides {
  readonly totals?: Partial<{
    compiles: number;
    searches: number;
    documentsIngested: number;
    memoriesWritten: number;
    tokensCompiled: number;
  }>;
  readonly entitlement?: unknown;
  readonly latency?: unknown;
  readonly quality?: unknown;
  readonly daily?: unknown;
}

function usage(overrides: UsageOverrides = {}) {
  return {
    from: '2026-05-01',
    until: '2026-05-30',
    totals: {
      compiles: 12,
      searches: 30,
      documentsIngested: 150,
      memoriesWritten: 4,
      tokensCompiled: 45_678,
      ...overrides.totals,
    },
    entitlement:
      'entitlement' in overrides
        ? overrides.entitlement
        : {
            maxMonthlyCompiles: 200,
            compilesUsed: 12,
            periodStart: '2026-05-01',
            periodEnd: '2026-05-31',
          },
    latency:
      'latency' in overrides
        ? overrides.latency
        : { compile: { avgMs: 240, maxMs: 1300 }, search: { avgMs: 18, maxMs: 60 } },
    quality:
      'quality' in overrides
        ? overrides.quality
        : { avgBudgetAdherence: 0.82, avgProvenanceCoverage: 0.97 },
    daily:
      'daily' in overrides
        ? overrides.daily
        : [
            {
              date: '2026-05-01',
              compiles: 5,
              searches: 10,
              documentsIngested: 100,
              tokensCompiled: 20_000,
            },
            {
              date: '2026-05-02',
              compiles: 7,
              searches: 20,
              documentsIngested: 50,
              tokensCompiled: 25_678,
            },
          ],
  };
}

// A BLOCK body, deliberately. `() => getUsage.mockReset()` returns the mock, and vitest treats a
// function returned from a hook as that hook's teardown — so it would CALL the mock after each test.
// With the pending-state test's never-resolving promise as the return value, vitest then awaits it
// and the hook times out at 10s. The sibling suites get away with the concise form only because
// their mocks always settle.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('AnalyticsView (F-057; FR-47)', () => {
  it('shows a skeleton while the query is pending', () => {
    getUsage.mockReturnValue(new Promise(() => {}));
    const { container } = renderView();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it('shows an error state with a retry when the query fails', async () => {
    getUsage.mockRejectedValue(new Error('nope'));
    renderView();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/couldn't load usage/i)).toBeTruthy();
  });

  it('says so plainly when the store holds no usage — never a flat zero chart', async () => {
    // Mutation check: hard-coding a sample series, or rendering the cards regardless, turns this red.
    // A dedicated page cannot return null the way the Overview's accent chart does, so the honest
    // form is an explicit empty state rather than a chart of nothing.
    getUsage.mockResolvedValue(
      usage({
        totals: {
          compiles: 0,
          searches: 0,
          documentsIngested: 0,
          memoriesWritten: 0,
          tokensCompiled: 0,
        },
        daily: [],
        latency: { compile: null, search: null },
        quality: null,
      }),
    );
    renderView();
    expect(await screen.findByText(/no usage recorded yet/i)).toBeTruthy();
    expect(screen.queryByText(/compiles per day/i)).toBeNull();
  });

  it('renders the totals and labels the window the server actually used', async () => {
    getUsage.mockResolvedValue(usage());
    const { container } = renderView();

    expect(await screen.findByText('12')).toBeTruthy();
    // Tokens compiled appears in BOTH the Usage card and the Cost posture card, deliberately — it is
    // the one number that is simultaneously a usage total and the only spend Tessera can account for.
    expect(screen.getAllByText('45,678')).toHaveLength(2);
    // `from`, not the 30 days requested — the ADR-0053 clause-3 rule, surfaced.
    //
    // Asserted on the container because React splits the interpolated date into its own text node.
    // And formatted through the SAME Intl call rather than hard-coded: this machine renders 2026-05-01
    // as '1 May', a US-locale machine as 'May 1', and pinning either would make the suite fail on the
    // other. What is actually under test is that the label carries the server's `from` — a date the
    // requested 30-day window would not produce.
    const expectedDay = new Date('2026-05-01T00:00:00.000Z').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    expect(container.textContent).toContain(`Since ${expectedDay}`);
    expect(container.textContent).toMatch(/utc days/i);
  });

  it('labels latency "average" and "slowest", and NEVER "p95"', async () => {
    // The load-bearing assertion of this suite (ADR-0060 §3). A sum and a max cannot produce a
    // percentile, so any copy claiming one would be fabrication. Mutation check: renaming a label to
    // "p95" turns this red.
    getUsage.mockResolvedValue(usage());
    const { container } = renderView();

    expect(await screen.findByText(/compile, average/i)).toBeTruthy();
    expect(screen.getByText(/compile, slowest/i)).toBeTruthy();
    expect(container.textContent).not.toMatch(/p95|percentile(?!s)/i);
  });

  it('shows a dash rather than a zero when a window has no compiles to average', async () => {
    getUsage.mockResolvedValue(
      usage({ latency: { compile: null, search: { avgMs: 18, maxMs: 60 } }, quality: null }),
    );
    renderView();

    // Anchored: the quality card's hint also begins "No compile in this window…", so a loose match
    // would pass while the latency card rendered nothing at all.
    expect(await screen.findByText(/^no compile in this window.$/i)).toBeTruthy();
    expect(
      screen.getByText(/no compile in this window carried scores, so there is no average/i),
    ).toBeTruthy();
  });

  it('never prints a currency figure', async () => {
    // DESIGN-SYSTEM §0: there is no per-token price and no provider bill in this system, so any
    // money on this page would be invented. Mutation check: adding an estimated cost turns this red.
    getUsage.mockResolvedValue(usage());
    const { container } = renderView();

    await screen.findByText(/cost posture/i);
    expect(container.textContent).not.toMatch(/[$€£¥]/);
  });

  it('reports metering as off on an unmetered deployment instead of inventing an entitlement', async () => {
    getUsage.mockResolvedValue(usage({ entitlement: null }));
    renderView();

    expect(await screen.findByText(/self-hosted and unmetered/i)).toBeTruthy();
    expect(screen.queryByText(/\/ 200/)).toBeNull();
  });

  it('shows usage against the entitlement on a metered deployment', async () => {
    getUsage.mockResolvedValue(usage());
    renderView();
    expect(await screen.findByText('12 / 200')).toBeTruthy();
  });

  it('reports an unlimited plan as unlimited, not as a number', async () => {
    getUsage.mockResolvedValue(
      usage({
        entitlement: {
          maxMonthlyCompiles: -1,
          compilesUsed: 5_000,
          periodStart: '2026-05-01',
          periodEnd: '2026-05-31',
        },
      }),
    );
    renderView();
    // `-1` is the sentinel. Printing "5,000 / -1" would be the obvious bug here.
    expect(await screen.findByText('5,000 / unlimited')).toBeTruthy();
  });

  it('says its day buckets are UTC, because they differ from the Overview chart', async () => {
    // Two day-boundary definitions in one product is confusing UNLESS it is stated (ADR-0060 §4).
    // Pre-aggregated buckets cannot be re-split into the viewer's frame the way F-088's are.
    getUsage.mockResolvedValue(usage());
    renderView();
    expect(await screen.findByText(/utc days/i)).toBeTruthy();
  });
});
