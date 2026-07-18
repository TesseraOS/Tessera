import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getStats = vi.hoisted(() => vi.fn());
const getActivity = vi.hoisted(() => vi.fn());
const getRecentActivity = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getStats, getActivity, getRecentActivity },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

// jsdom has no EventSource; keep the SSE subscription inert so the page renders deterministically.
vi.mock('@/lib/api/events', () => ({
  useApiEvent: () => undefined,
  useEventsStatus: () => 'open',
}));

import { Dashboard } from '@/components/dashboard';

const POPULATED = {
  documents: 1234,
  memories: 12,
  graph: { nodes: 512, effectLinks: 87 },
  sources: 3,
  lastScanAt: '2026-07-16T10:00:00.000Z',
};

const EMPTY = {
  documents: 0,
  memories: 0,
  graph: { nodes: 0, effectLinks: 0 },
  sources: 0,
  lastScanAt: null,
};

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const onboarding = () => screen.queryByText('Get started');

beforeEach(() => {
  getStats.mockReset();
  getActivity.mockReset();
  getRecentActivity.mockReset();
  // The chart self-hides on empty history; default it so the dashboard tests stay about onboarding.
  getActivity.mockResolvedValue({ from: '2026-03-01', until: '2026-03-31', points: [] });
  getRecentActivity.mockResolvedValue({ events: [] });
});

/**
 * F-080 / ADR-0053: onboarding renders **only while the workspace is provably empty**.
 *
 * The gate is `/v1/stats`, deliberately, and these tests pin down why. The intuitive alternative —
 * "hide it once the activity feed has entries" — is still wrong after F-089 made the feed
 * persisted: the feed reads the pruned audit trail, and retention can empty it for a workspace
 * that is anything but empty. The stat counts are the provable emptiness signal.
 */
describe('Dashboard onboarding gate', () => {
  it('offers onboarding for a provably empty workspace', async () => {
    getStats.mockResolvedValue(EMPTY);
    renderWithClient(<Dashboard />);

    expect(await screen.findByText('Get started')).toBeInTheDocument();
    // Text unique to the onboarding steps: "Connect a source" itself is ALSO the feed's empty-state
    // CTA, so on an empty workspace it legitimately appears twice (see the note on this describe).
    expect(screen.getByText(/Point Tessera at a filesystem path/i)).toBeInTheDocument();
  });

  it('hides onboarding once the workspace has real data', async () => {
    getStats.mockResolvedValue(POPULATED);
    renderWithClient(<Dashboard />);

    // Wait for the query to settle, then assert absence — the reported complaint was onboarding
    // still showing for a workspace with sources connected.
    await screen.findByText('Recent activity');
    await vi.waitFor(() => expect(onboarding()).not.toBeInTheDocument());
  });

  it('keeps onboarding hidden for a populated workspace even when the trail is empty', async () => {
    // The regression the /v1/stats gate exists to prevent: retention can prune the trail to
    // nothing for a workspace with 3 connected sources. Gating on the feed would tell that user to
    // go connect a source.
    getStats.mockResolvedValue(POPULATED);
    getRecentActivity.mockResolvedValue({ events: [] });

    renderWithClient(<Dashboard />);

    await screen.findByText('No recorded activity yet');
    expect(onboarding()).not.toBeInTheDocument();
  });

  it('shows onboarding for an empty workspace that has trail activity', async () => {
    // The mirror case: the trail holds a scan request whose scan added nothing. Activity is not
    // data — the workspace is still empty, so onboarding still applies.
    getStats.mockResolvedValue(EMPTY);
    getRecentActivity.mockResolvedValue({
      events: [
        {
          id: 'evt-1',
          action: 'source.manage',
          target: '/v1/sources/:id/scan',
          actor: { principalId: 'local', kind: 'local' },
          at: '2026-07-18T10:00:00.000Z',
        },
      ],
    });

    renderWithClient(<Dashboard />);

    expect(await screen.findByText('Get started')).toBeInTheDocument();
    expect(await screen.findByText('Source scan started')).toBeInTheDocument();
  });

  it('does not guess while stats are loading', () => {
    getStats.mockReturnValue(new Promise(() => {})); // never settles
    renderWithClient(<Dashboard />);

    // "We do not know yet" must not render as "you have nothing" — the same distinction the stat
    // cards draw by showing '—' rather than 0.
    expect(onboarding()).not.toBeInTheDocument();
  });

  it('does not claim an empty workspace when stats fail to load', async () => {
    getStats.mockRejectedValue(new Error('boom'));
    renderWithClient(<Dashboard />);

    await screen.findByText('Recent activity');
    await vi.waitFor(() => expect(onboarding()).not.toBeInTheDocument());
  });
});

describe('Dashboard hero retirement (ADR-0053)', () => {
  it('leads with the stat cards, not a greeting band', async () => {
    getStats.mockResolvedValue(POPULATED);
    renderWithClient(<Dashboard />);

    await screen.findByText('Indexed documents');
    // The marketing band that used to own the first screen behind a login.
    expect(screen.queryByText(/Give your agents the right context/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Context & Memory OS')).not.toBeInTheDocument();
  });

  it('still gives the route an accessible heading', async () => {
    getStats.mockResolvedValue(POPULATED);
    renderWithClient(<Dashboard />);

    // The hero's h1 left with it; the page must still announce itself.
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });
});
