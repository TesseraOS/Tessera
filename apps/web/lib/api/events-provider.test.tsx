import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('@/lib/api/client', () => ({
  api: {},
  API_ORIGIN: 'http://localhost:3000',
  TesseraApiError: class extends Error {},
}));

const sessionStatus = vi.hoisted(() => ({ current: 'authenticated' as string }));
vi.mock('@/lib/auth/use-session', () => ({
  useSession: () => ({ status: sessionStatus.current }),
}));

import { EventsProvider, useApiEvent, useEventsStatus } from '@/lib/api/events';

/**
 * A controllable stand-in for the browser `EventSource` — jsdom has none, and the behaviour under
 * test (auto-retry vs. give-up) is precisely the part of the real class that is hard to provoke.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Simulate the server accepting the stream. */
  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  /** Simulate a transient drop: EventSource retries on its own. */
  dropTransiently(): void {
    this.readyState = FakeEventSource.CONNECTING;
    this.onerror?.();
  }

  /** Simulate a fatal error (e.g. a 401): EventSource gives up for good. */
  fail(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent as Event);
    }
  }
}

function Probe() {
  const status = useEventsStatus();
  useApiEvent('memory.captured', (data) => {
    const title = data['title'];
    if (typeof title === 'string') {
      document.title = title;
    }
  });
  return <span data-testid="status">{status}</span>;
}

describe('EventsProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    sessionStatus.current = 'authenticated';
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]!;

  it('opens exactly ONE connection however many consumers subscribe', () => {
    render(
      <EventsProvider>
        <Probe />
        <Probe />
        <Probe />
      </EventsProvider>,
    );
    // The point of the provider: three consumers, one socket (it was one socket per consumer).
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('opens no connection until someone is signed in', () => {
    sessionStatus.current = 'loading';
    render(
      <EventsProvider>
        <Probe />
      </EventsProvider>,
    );
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('closes the connection on unmount', () => {
    const { unmount } = render(
      <EventsProvider>
        <Probe />
      </EventsProvider>,
    );
    const source = latest();
    unmount();
    expect(source.closed).toBe(true);
  });

  it('delivers a parsed event to its subscriber', () => {
    render(
      <EventsProvider>
        <Probe />
      </EventsProvider>,
    );
    act(() => {
      latest().open();
      latest().emit('memory.captured', { title: 'Adopt SSE' });
    });
    expect(document.title).toBe('Adopt SSE');
  });

  it('stays quiet through a transient drop that recovers', () => {
    render(
      <EventsProvider>
        <Probe />
      </EventsProvider>,
    );
    act(() => latest().open());
    expect(screen.getByTestId('status')).toHaveTextContent('open');

    // EventSource re-opens on every routine blip. Flashing a warning for each one trains the user
    // to ignore it, so a drop that recovers within the grace window must never surface.
    act(() => latest().dropTransiently());
    act(() => void vi.advanceTimersByTime(3_000));
    expect(screen.getByTestId('status')).toHaveTextContent('open');

    act(() => latest().open());
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByTestId('status')).toHaveTextContent('open');
  });

  it('reports reconnecting once a drop outlives the grace window', () => {
    render(
      <EventsProvider>
        <Probe />
      </EventsProvider>,
    );
    act(() => latest().open());
    act(() => latest().dropTransiently());
    act(() => void vi.advanceTimersByTime(6_000));

    // A feed that is genuinely behind must say so — silence here would be the dishonest failure.
    expect(screen.getByTestId('status')).toHaveTextContent('reconnecting');
  });

  it('reconnects itself when EventSource gives up for good (a 401 leaves it CLOSED)', () => {
    render(
      <EventsProvider>
        <Probe />
      </EventsProvider>,
    );
    act(() => latest().open());
    expect(FakeEventSource.instances).toHaveLength(1);

    // CLOSED means EventSource will never retry — without the supervisor the feed dies silently.
    act(() => latest().fail());
    act(() => void vi.advanceTimersByTime(1_100)); // past the first backoff window
    expect(FakeEventSource.instances).toHaveLength(2);

    // And the replacement is live.
    act(() => {
      latest().open();
      latest().emit('memory.captured', { title: 'Back online' });
    });
    expect(document.title).toBe('Back online');
    expect(screen.getByTestId('status')).toHaveTextContent('open');
  });

  it('backs off further on each successive failure instead of hot-looping', () => {
    render(
      <EventsProvider>
        <Probe />
      </EventsProvider>,
    );
    act(() => latest().fail());
    act(() => void vi.advanceTimersByTime(1_100));
    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => latest().fail());
    // The second window tops out at 2s, so 1.1s must NOT yet have produced a third attempt.
    act(() => void vi.advanceTimersByTime(400));
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => void vi.advanceTimersByTime(1_800));
    expect(FakeEventSource.instances).toHaveLength(3);
  });
});
