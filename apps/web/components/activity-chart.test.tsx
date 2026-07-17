import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getActivity = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getActivity },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// Recharts needs real layout (a 0x0 ResponsiveContainer in jsdom renders nothing and warns), and it
// is third-party — its rendering is verified visually by the F-084 screenshot, not here. Stub the
// shadcn chart wrapper to a passthrough so these tests exercise THIS component's logic: the honest
// self-hiding and the window label. recharts primitives render as inert nodes.
vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));
vi.mock('recharts', () => {
  const Noop = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { AreaChart: Noop, Area: Noop, CartesianGrid: Noop, XAxis: Noop, YAxis: Noop };
});

import { ActivityChart } from '@/components/activity-chart';

function renderChart(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const card = (root: HTMLElement) => root.querySelector('[data-slot="card"]');

beforeEach(() => getActivity.mockReset());

/**
 * F-084 / ADR-0053 clause 3. The chart's honesty is in what it does NOT show: nothing, when there is
 * no history — so the Overview never carries a flat zero line for a workspace that has done nothing.
 * And it labels the window the SERVER returned (`from`), not the 30 days requested.
 */
describe('ActivityChart', () => {
  it('renders nothing once it resolves to no history (points empty)', async () => {
    getActivity.mockResolvedValue({ from: '2026-03-01', until: '2026-03-31', points: [] });
    const { container } = renderChart(<ActivityChart />);
    // Wait past the loading skeleton to the settled state — then the card must be gone.
    await vi.waitFor(() => expect(card(container)).toBeNull());
  });

  it('renders nothing when every day is zero (data, but no work)', async () => {
    getActivity.mockResolvedValue({
      from: '2026-03-29',
      until: '2026-03-31',
      points: [
        { date: '2026-03-29', count: 0 },
        { date: '2026-03-30', count: 0 },
        { date: '2026-03-31', count: 0 },
      ],
    });
    const { container } = renderChart(<ActivityChart />);
    await vi.waitFor(() => expect(card(container)).toBeNull());
  });

  it('renders and labels the window the server actually used, not the request', async () => {
    // The request is 30 days, but the trail only reaches 03-29 — the label must say "since Mar 29".
    getActivity.mockResolvedValue({
      from: '2026-03-29',
      until: '2026-03-31',
      points: [
        { date: '2026-03-29', count: 4 },
        { date: '2026-03-30', count: 0 },
        { date: '2026-03-31', count: 2 },
      ],
    });
    const { container } = renderChart(<ActivityChart />);

    expect(await screen.findByText('Activity')).toBeInTheDocument();

    // Compute the label the way the component does, so the assertion is locale-independent: the point
    // is that `from` (03-29) is shown, not the 30-days-ago the request implied. Target the description
    // node directly (a `textContent.includes` matcher also matches every ancestor).
    const expectedLabel = new Date('2026-03-29T00:00:00.000Z').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const description = container.querySelector('[data-slot="card-description"]');
    expect(description?.textContent).toContain(`since ${expectedLabel}`);
  });

  // The `isError` branch is the same `return null` path the empty/all-zero cases above already prove
  // end-to-end; it is not given its own test because a rejected query settling as the component
  // unmounts trips vitest's unhandled-rejection guard, and a global swallow to work around that would
  // hide real rejections elsewhere. The guard is one line and covered by the shared null-render path.
});
