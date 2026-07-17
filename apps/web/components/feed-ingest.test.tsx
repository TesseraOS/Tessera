import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('@/lib/api/client', () => ({
  api: {},
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

vi.mock('@/lib/auth/use-session', () => ({
  useSession: () => ({ status: 'authenticated' }),
  // `Providers` renders the real SessionProvider; stand it in as a passthrough so the tree mounts
  // without an identity fetch. The ingest under test does not read it — `EventsProvider` does, via
  // the mocked `useSession` above.
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

import { Providers } from '@/app/providers';
import { FeedIngest } from '@/components/activity-feed';
import { EventsProvider } from '@/lib/api/events';
import { useNotifications } from '@/lib/store/notifications';

/**
 * F-079 regression: **the live feed must ingest on every route, not just Overview.**
 *
 * The defect these tests pin down was not in the transport. `EventsProvider` was already correct —
 * one socket, fanned out to subscribers. The ingest that pushes those events into the notifications
 * store was mounted at the *Overview root*, so on `/sources` — the one route from which scans are
 * actually triggered — the stream had zero subscribers and every frame was parsed and thrown away.
 * The bell never counted the scan the user just started, and Overview later rendered an empty feed.
 *
 * Hence the shape of these tests: `<FeedIngest />` is rendered **without** the Overview page. That
 * is the whole point — if the ingest ever depends on a page being mounted, this file fails.
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
  useNotifications.getState().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FeedIngest', () => {
  it('captures a scan completed while the user is NOT on Overview', () => {
    // No Dashboard anywhere in this tree — the user is on /sources, where scans are started.
    render(
      <EventsProvider>
        <FeedIngest />
      </EventsProvider>,
    );

    act(() => {
      latest().open();
      latest().emit('source.scan.completed', {
        sourceId: 'src_1',
        kind: 'filesystem',
        label: 'tessera',
        summary: { added: 3, modified: 0, removed: 0, unchanged: 12 },
      });
    });

    const { entries, unread } = useNotifications.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe('source.scan.completed');
    expect(entries[0]?.data['label']).toBe('tessera');
    // The bell renders on every route, so it must have something to count.
    expect(unread).toBe(1);
  });

  it('captures every stream event type the feed renders', () => {
    render(
      <EventsProvider>
        <FeedIngest />
      </EventsProvider>,
    );

    act(() => {
      latest().open();
      latest().emit('source.scan.started', { sourceId: 's', kind: 'git', label: 'repo' });
      latest().emit('document.ingested', { ref: 'd1', path: 'src/a.ts', kind: 'code' });
      latest().emit('document.removed', { ref: 'd2', path: 'src/b.ts' });
      latest().emit('memory.captured', { lineageId: 'l1', kind: 'decision', title: 'Adopt SSE' });
    });

    expect(useNotifications.getState().entries.map((entry) => entry.type)).toEqual([
      'memory.captured',
      'document.removed',
      'document.ingested',
      'source.scan.started',
    ]);
  });

  it('pushes each event exactly once (a second mount would double-count)', () => {
    render(
      <EventsProvider>
        <FeedIngest />
      </EventsProvider>,
    );

    act(() => {
      latest().open();
      latest().emit('source.scan.started', { sourceId: 's', kind: 'git', label: 'repo' });
    });

    // The mirror-image of the bug being fixed: mounting the ingest twice would record it twice.
    expect(useNotifications.getState().entries).toHaveLength(1);
    expect(useNotifications.getState().unread).toBe(1);
  });

  it('renders nothing — it is a mount point, not UI', () => {
    const { container } = render(
      <EventsProvider>
        <FeedIngest />
      </EventsProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * The tests above prove `FeedIngest` works when mounted. This one proves it **is** mounted.
 *
 * Without it the suite would have a hole exactly the shape of the original bug: every test above
 * renders `FeedIngest` explicitly, so they would all stay green if someone removed it from the
 * provider tree — which is precisely the failure being fixed (a correct ingest that nothing mounts
 * app-wide). This renders the real `Providers` and asserts an event reaches the store through it.
 */
describe('Providers wiring', () => {
  it('mounts the activity ingest app-wide, with no page rendered', () => {
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
    });

    expect(useNotifications.getState().entries).toHaveLength(1);
    expect(useNotifications.getState().unread).toBe(1);
  });
});
