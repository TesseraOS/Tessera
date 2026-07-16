import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getStats = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getStats },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// jsdom has no EventSource; keep the SSE subscription inert so the cards render deterministically.
vi.mock('@/lib/api/events', () => ({ useApiEvent: () => undefined }));

import { DashboardStats } from '@/components/stats';

const STATS = {
  documents: 1234,
  memories: 12,
  graph: { nodes: 512, effectLinks: 87 },
  sources: 3,
  lastScanAt: '2026-07-16T10:00:00.000Z',
};

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('DashboardStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the REAL counts from GET /v1/stats', async () => {
    getStats.mockResolvedValue(STATS);
    renderWithClient(<DashboardStats />);

    // The regression this feature exists for: these were hardcoded '—'/'0' while the API had data.
    expect(await screen.findByText('1,234')).toBeInTheDocument(); // documents, grouped
    expect(await screen.findByText('12')).toBeInTheDocument(); // memories
    expect(await screen.findByText('87')).toBeInTheDocument(); // effect-links
    expect(await screen.findByText('3')).toBeInTheDocument(); // sources
    expect(screen.getByText('Indexed documents')).toBeInTheDocument();
  });

  it('renders NO delta — no prior-period data exists, so no trend may be shown', async () => {
    getStats.mockResolvedValue(STATS);
    const { container } = renderWithClient(<DashboardStats />);
    await screen.findByText('1,234');

    // Deltas would have to be invented: nothing stores a prior-period snapshot (plan D4). Assert on
    // the rendered output so a future change that starts fabricating trends fails here.
    expect(container.textContent).not.toMatch(/%/);
    expect(screen.queryByTestId('delta')).not.toBeInTheDocument();
  });

  it('shows skeletons while loading, not zeros', async () => {
    getStats.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithClient(<DashboardStats />);

    expect(screen.getAllByTestId('stat-skeleton')).toHaveLength(4);
    // "Loading" must never be rendered as "you have none".
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('says the numbers are unavailable on error rather than showing zeros', async () => {
    getStats.mockRejectedValue(new Error('boom'));
    renderWithClient(<DashboardStats />);

    expect(await screen.findAllByText('Unavailable — retrying')).toHaveLength(4);
    // A failed load is not a count of zero — showing 0 here would be the same lie in a new outfit.
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('renders a genuine zero as 0, not as unknown', async () => {
    getStats.mockResolvedValue({
      documents: 0,
      memories: 0,
      graph: { nodes: 0, effectLinks: 0 },
      sources: 0,
      lastScanAt: null,
    });
    renderWithClient(<DashboardStats />);

    // An empty workspace really has zero — that is a fact, and distinct from '—' (unknown).
    expect(await screen.findAllByText('0')).toHaveLength(4);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
