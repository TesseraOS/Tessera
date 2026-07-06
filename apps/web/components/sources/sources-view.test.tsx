import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const listSources = vi.hoisted(() => vi.fn());
const getScanStatus = vi.hoisted(() => vi.fn(async () => ({ state: 'idle' as const })));

vi.mock('@/lib/api/client', () => ({
  api: {
    listSources,
    getScanStatus,
    scanSource: vi.fn(),
    removeSource: vi.fn(),
    registerSource: vi.fn(),
  },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// jsdom has no EventSource; keep the SSE hook inert and deterministic for the view test.
vi.mock('@/lib/api/events', () => ({ useScanEvents: () => ({ bySource: {} }) }));

import { SourcesView } from '@/components/sources/sources-view';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SourcesView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders registered sources with their path', async () => {
    listSources.mockResolvedValue({
      sources: [
        {
          id: 's1',
          kind: 'filesystem',
          label: 'Backend monorepo',
          config: { root: '/srv/app' },
          createdAt: '2026-07-06T10:00:00.000Z',
        },
      ],
    });

    renderWithClient(<SourcesView />);

    expect(await screen.findByText('Backend monorepo')).toBeInTheDocument();
    expect(screen.getByText('/srv/app')).toBeInTheDocument();
  });

  it('shows an empty state with a register CTA when there are no sources', async () => {
    listSources.mockResolvedValue({ sources: [] });

    renderWithClient(<SourcesView />);

    expect(await screen.findByText('No sources yet')).toBeInTheDocument();
  });

  it('shows an error state when the list fails to load', async () => {
    listSources.mockRejectedValue(new Error('connection refused'));

    renderWithClient(<SourcesView />);

    expect(await screen.findByText('Could not load sources')).toBeInTheDocument();
  });
});
