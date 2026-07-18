import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const listSources = vi.hoisted(() => vi.fn());
const getScanStatus = vi.hoisted(() => vi.fn());

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

// jsdom has no EventSource; keep the SSE hooks inert and deterministic for the view test. Tests
// control the live per-source state through `scanEvents` (reset in beforeEach).
const scanEvents = vi.hoisted(() => ({ bySource: {} as Record<string, unknown> }));
vi.mock('@/lib/api/events', () => ({
  useScanEvents: () => scanEvents,
  useApiEvent: () => {},
}));

import { SourcesView } from '@/components/sources/sources-view';

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SourcesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scanEvents.bySource = {};
    getScanStatus.mockResolvedValue({ state: 'idle' as const });
  });

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

  it('shows the running state with a full-card progress rail while a scan runs', async () => {
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
    scanEvents.bySource = { s1: { running: true, processed: 3, total: 12 } };

    renderWithClient(<SourcesView />);

    expect(
      await screen.findByRole('progressbar', { name: 'Scanning Backend monorepo' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scanning/ })).toBeDisabled();
  });

  it('leaves the scanning state when the stream reports completion despite a stale running snapshot (F-087)', async () => {
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
    // The cached snapshot from mid-scan still claims `running` — the pre-F-087 stuck state.
    getScanStatus.mockResolvedValue({ state: 'running', progress: { processed: 1, total: 4 } });
    scanEvents.bySource = {
      s1: {
        running: false,
        processed: 4,
        total: 4,
        lastSummary: { added: 4, modified: 0, removed: 0, unchanged: 8 },
        at: '2026-07-18T10:00:00.000Z',
      },
    };

    renderWithClient(<SourcesView />);

    expect(await screen.findByText(/4 added/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan' })).toBeEnabled();
  });
});
