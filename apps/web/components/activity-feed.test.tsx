import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api/client', () => ({
  api: {},
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

const status = vi.hoisted(() => ({ current: 'open' as string }));
vi.mock('@/lib/api/events', () => ({
  useApiEvent: () => undefined,
  useEventsStatus: () => status.current,
}));

import { ActivityFeed, describeEntry, relativeTime } from '@/components/activity-feed';
import { useNotifications, type FeedEntry } from '@/lib/store/notifications';

function entry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: 'e1',
    type: 'memory.captured',
    at: new Date().toISOString(),
    data: { title: 'Adopt SSE', kind: 'decision' },
    ...overrides,
  };
}

describe('describeEntry', () => {
  it('describes a captured memory by its title', () => {
    expect(describeEntry(entry())).toMatchObject({
      title: 'Adopt SSE',
      detail: 'decision captured',
    });
  });

  it('describes an ingested document by its path', () => {
    const described = describeEntry(
      entry({ type: 'document.ingested', data: { path: 'src/a.ts', kind: 'code' } }),
    );
    expect(described.title).toBe('src/a.ts');
    expect(described.detail).toBe('indexed');
  });

  it('describes a completed scan with what it added', () => {
    const described = describeEntry(
      entry({
        type: 'source.scan.completed',
        data: { label: 'acme/repo', summary: { added: 3, modified: 0, removed: 0, unchanged: 1 } },
      }),
    );
    expect(described.title).toBe('acme/repo');
    expect(described.detail).toBe('scan completed — 3 added');
  });

  it('falls back to a sensible label when a payload field is missing', () => {
    // The feed must never render "undefined" at a user.
    const described = describeEntry(entry({ type: 'document.ingested', data: {} }));
    expect(described.title).toBe('Document ingested');
    expect(described.title).not.toContain('undefined');
  });
});

describe('relativeTime', () => {
  it('reads coarsely and never renders a negative age', () => {
    const now = Date.parse('2026-07-16T12:00:00.000Z');
    expect(relativeTime('2026-07-16T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-07-16T11:45:00.000Z', now)).toBe('15m ago');
    expect(relativeTime('2026-07-16T09:00:00.000Z', now)).toBe('3h ago');
    // Clock skew between server and browser must not produce "-2m ago".
    expect(relativeTime('2026-07-16T12:00:30.000Z', now)).toBe('just now');
  });
});

describe('ActivityFeed', () => {
  beforeEach(() => {
    useNotifications.getState().clear();
    status.current = 'open';
  });

  it('shows an honest empty state scoped to the session', () => {
    render(<ActivityFeed />);
    // Not "nothing ever happened" — this feed only ever knew about this session (F-065 persists).
    expect(screen.getByText('No activity this session')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connect a source/i })).toBeInTheDocument();
  });

  it('renders received events newest-first', () => {
    useNotifications.getState().push('memory.captured', { title: 'First', kind: 'decision' });
    useNotifications.getState().push('source.scan.started', { label: 'acme/repo' });
    render(<ActivityFeed />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('acme/repo');
    expect(items[1]).toHaveTextContent('First');
  });

  it('admits when the live connection is down instead of looking merely quiet', () => {
    status.current = 'reconnecting';
    render(<ActivityFeed />);
    // A stale feed that looks healthy is worse than one that says it is behind.
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
  });

  it('warns that a populated feed may be behind while reconnecting', () => {
    useNotifications.getState().push('memory.captured', { title: 'First', kind: 'decision' });
    status.current = 'reconnecting';
    render(<ActivityFeed />);
    expect(screen.getByRole('status')).toHaveTextContent(/may be behind/i);
  });
});
