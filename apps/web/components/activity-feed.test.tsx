import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getRecentActivity = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  api: { getRecentActivity },
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

const status = vi.hoisted(() => ({ current: 'open' as string }));
vi.mock('@/lib/api/events', () => ({
  useApiEvent: () => undefined,
  useEventsStatus: () => status.current,
}));

import { ActivityFeed, describeEvent, relativeTime } from '@/components/activity-feed';
import type { RecentActivityEvent } from '@/lib/api/types';

function event(overrides: Partial<RecentActivityEvent> = {}): RecentActivityEvent {
  return {
    id: 'evt-1',
    action: 'memory.write',
    target: '/v1/memory',
    actor: { principalId: 'local', kind: 'local' },
    at: new Date().toISOString(),
    ...overrides,
  };
}

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityFeed />
    </QueryClientProvider>,
  );
}

describe('describeEvent', () => {
  it('describes a capture vs an update by the memory.write target', () => {
    expect(describeEvent(event()).title).toBe('Memory captured');
    expect(describeEvent(event({ target: 'lin_abc123' }))).toMatchObject({
      title: 'Memory updated',
      detail: 'lin_abc123', // the lineage id is worth showing; a route pattern is not
    });
  });

  it('distinguishes source register / scan / remove by target', () => {
    expect(describeEvent(event({ action: 'source.manage', target: '/v1/sources' })).title).toBe(
      'Source registered',
    );
    expect(
      describeEvent(event({ action: 'source.manage', target: '/v1/sources/:id/scan' })).title,
    ).toBe('Source scan started');
    expect(describeEvent(event({ action: 'source.manage', target: '/v1/sources/:id' })).title).toBe(
      'Source removed',
    );
  });

  it('labels a compile and never surfaces a raw route pattern as detail', () => {
    const described = describeEvent(event({ action: 'compile', target: '/v1/compile' }));
    expect(described.title).toBe('Context compiled');
    expect(described.detail).toBeUndefined();
  });

  it('renders an unknown action honestly instead of crashing or showing undefined', () => {
    const described = describeEvent(event({ action: 'future.action', target: '/v1/future' }));
    expect(described.title).toBe('future action');
    expect(described.title).not.toContain('undefined');
  });
});

describe('relativeTime', () => {
  it('reads coarsely and never renders a negative age', () => {
    const now = Date.parse('2026-07-16T12:00:00.000Z');
    expect(relativeTime('2026-07-16T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-07-16T11:45:00.000Z', now)).toBe('15m ago');
    expect(relativeTime('2026-07-16T09:00:00.000Z', now)).toBe('3h ago');
    expect(relativeTime('2026-07-14T09:00:00.000Z', now)).toBe('2d ago');
    // Clock skew between server and browser must not produce "-2m ago".
    expect(relativeTime('2026-07-16T12:00:30.000Z', now)).toBe('just now');
  });
});

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status.current = 'open';
  });

  it('shows an honest empty state when the trail has no recorded activity', async () => {
    getRecentActivity.mockResolvedValue({ events: [] });
    renderFeed();

    // Persisted now (F-089) — the copy says the history stays, with no session scoping.
    expect(await screen.findByText('No recorded activity yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connect a source/i })).toBeInTheDocument();
  });

  it('renders the persisted trail rows, newest-first as served', async () => {
    getRecentActivity.mockResolvedValue({
      events: [
        event({ id: 'e2', action: 'source.manage', target: '/v1/sources/:id/scan' }),
        event({ id: 'e1', action: 'memory.write', target: '/v1/memory' }),
      ],
    });
    renderFeed();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Source scan started');
    expect(items[1]).toHaveTextContent('Memory captured');
  });

  it('states a load failure instead of pretending the workspace is idle', async () => {
    getRecentActivity.mockRejectedValue(new Error('down'));
    renderFeed();

    expect(await screen.findByText(/could not load recent activity/i)).toBeInTheDocument();
  });

  it('warns that a populated feed may be behind while reconnecting', async () => {
    getRecentActivity.mockResolvedValue({ events: [event()] });
    status.current = 'reconnecting';
    renderFeed();

    await screen.findAllByRole('listitem');
    expect(screen.getByRole('status')).toHaveTextContent(/may be behind/i);
  });
});
