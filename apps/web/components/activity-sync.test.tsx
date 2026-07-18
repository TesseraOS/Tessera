import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/client', () => ({
  api: {},
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

vi.mock('@/lib/auth/use-session', () => ({
  useSession: () => ({ status: 'authenticated', identity: null }),
  // `Providers` renders the real SessionProvider; stand it in as a passthrough so the tree mounts
  // without an identity fetch. The sync under test does not read it — `EventsProvider` does, via
  // the mocked `useSession` above.
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

import { Providers } from '@/app/providers';
import { ActivitySync } from '@/components/activity-sync';
import { EventsProvider } from '@/lib/api/events';
import { RECENT_ACTIVITY_QUERY_KEY } from '@/lib/api/hooks';

/**
 * F-089 (holding F-079's line): **the stream must reach the persisted feed from every route.**
 *
 * F-079's bug was an ingest mounted on one page, so events on `/sources` were parsed and dropped.
 * The ingest is gone — the feed renders the trail now — but the same hole can reopen as "nothing
 * tells TanStack Query the trail moved". Hence the same test shape: `ActivitySync` rendered with
 * NO page, and a final test that renders the real `Providers` to prove it is mounted app-wide.
 */

/** The controllable EventSource stand-in (jsdom has none); mirrors `events-provider.test.tsx`. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent as Event);
    }
  }
}

const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]!;

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSync() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <EventsProvider>
        <ActivitySync />
      </EventsProvider>
    </QueryClientProvider>,
  );
  return invalidate;
}

const recentCalls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(
    (call) =>
      (call[0] as { queryKey?: unknown } | undefined)?.queryKey === RECENT_ACTIVITY_QUERY_KEY,
  );

describe('ActivitySync', () => {
  it('invalidates the recent-activity query when the stream reports work — from any route', () => {
    const invalidate = renderSync();

    act(() => {
      latest().open();
      latest().emit('memory.captured', { lineageId: 'l1', kind: 'decision', title: 'Adopt SSE' });
      vi.advanceTimersByTime(600);
    });

    expect(recentCalls(invalidate)).toHaveLength(1);
  });

  it('coalesces an event burst into one refetch (the debounce)', () => {
    const invalidate = renderSync();

    act(() => {
      latest().open();
      latest().emit('source.scan.started', { sourceId: 's', kind: 'git', label: 'repo', total: 3 });
      latest().emit('memory.captured', { lineageId: 'l1', kind: 'decision', title: 'One' });
      latest().emit('source.scan.completed', {
        sourceId: 's',
        kind: 'git',
        label: 'repo',
        summary: { added: 3, modified: 0, removed: 0, unchanged: 0 },
      });
      vi.advanceTimersByTime(600);
    });

    expect(recentCalls(invalidate)).toHaveLength(1);
  });

  it('ignores per-document ingest events — they carry no trail row and were the burst', () => {
    const invalidate = renderSync();

    act(() => {
      latest().open();
      latest().emit('document.ingested', { ref: 'd1', path: 'src/a.ts', kind: 'code' });
      vi.advanceTimersByTime(600);
    });

    expect(recentCalls(invalidate)).toHaveLength(0);
  });

  it('renders nothing — it is a mount point, not UI', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <EventsProvider>
          <ActivitySync />
        </EventsProvider>
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * The tests above prove `ActivitySync` works when mounted. This one proves it **is** mounted —
 * without it, removing the sync from the provider tree would leave every test green while the app
 * regresses to exactly the F-079 hole (a correct bridge that nothing mounts).
 */
describe('Providers wiring', () => {
  it('mounts the activity sync app-wide, with no page rendered', () => {
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

    render(
      <Providers>
        <span>a page that is not Overview</span>
      </Providers>,
    );

    act(() => {
      latest().open();
      latest().emit('source.scan.completed', {
        sourceId: 'src_1',
        kind: 'filesystem',
        label: 'tessera',
        summary: { added: 1, modified: 0, removed: 0, unchanged: 0 },
      });
      vi.advanceTimersByTime(600);
    });

    expect(recentCalls(invalidate)).toHaveLength(1);
  });
});
