'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { API_ORIGIN } from './client';
import { useSession } from '@/lib/auth/use-session';
import type { ScanSummary } from './types';

/**
 * The dashboard's live-update client over the `GET /v1/events` SSE stream (FR-38).
 *
 * **One connection, many consumers.** {@link EventsProvider} owns a single `EventSource` and fans
 * events out to subscribers. Before F-060 each consumer opened its own socket (scan progress +
 * the timeline = two); adding the Overview feed + the notifications bell would have made four
 * sockets per session for one stream. Consumers subscribe through context instead.
 *
 * **Resilient.** `EventSource` retries transient drops itself (driven by the server's `retry: 3000`
 * hint) but gives up permanently on a non-2xx — e.g. a 401 once a session expires — leaving a
 * silently dead stream. The supervisor watches for that and reconnects with exponential backoff +
 * jitter, and reports {@link ConnectionStatus} so the UI can say it is reconnecting rather than
 * quietly going stale.
 *
 * **Auth-aware.** No socket without a session; torn down on sign-out. No token is handled here: the
 * stream is same-origin through the Next proxy, which injects the bearer from the httpOnly cookie
 * (ADR-0048) — nothing secret touches client JS or a URL.
 *
 * The state math stays in **pure reducers** so it unit-tests offline, with no socket.
 */

/** Event names the stream carries (mirrors the API's `API_EVENT_TYPES`). */
export const API_EVENT_TYPES = [
  'document.ingested',
  'document.removed',
  'memory.captured',
  'source.scan.started',
  'source.scan.progress',
  'source.scan.failed',
  'source.scan.completed',
] as const;

export type ApiEventType = (typeof API_EVENT_TYPES)[number];

/** What the live connection is doing, so the UI can be honest about staleness. */
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'error';

type EventHandler = (data: Record<string, unknown>) => void;

interface EventsContextValue {
  readonly status: ConnectionStatus;
  /** Subscribe to one event type; returns an unsubscribe. */
  readonly subscribe: (type: ApiEventType, handler: EventHandler) => () => void;
}

/** Reconnection backoff bounds (ms). */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/**
 * How long a drop must persist before consumers are told the feed is degraded.
 *
 * `EventSource` re-opens on every routine blip — an API redeploy, a proxy timeout, a laptop waking —
 * and recovers within the server's `retry: 3000` hint. Surfacing each of those would flash a warning
 * that is true for one second and then gone, and a banner that cries wolf gets ignored precisely
 * when it finally matters. Longer than that hint, so a normal reconnect stays silent and only a
 * genuinely stale feed says so.
 */
const DEGRADED_AFTER_MS = 5_000;

/**
 * Delay before reconnect attempt `attempt` (0-based): exponential, capped, with **full jitter** over
 * the upper half of the window. Jitter matters — without it every dashboard open during an API
 * restart would retry in lockstep and hammer it back down. Pure, so the schedule is unit-testable.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const window = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  return Math.round(window / 2 + random() * (window / 2));
}

/** Parse an SSE `data:` payload into a typed object, or `undefined` if it is not valid JSON. */
function parseData(raw: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const EventsContext = createContext<EventsContextValue | undefined>(undefined);

/**
 * Own the single live `EventSource` and fan its events out. Mount once, inside the session provider
 * (it needs to know whether anyone is signed in). SSR-safe — no socket on the server.
 */
export function EventsProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus } = useSession();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  // Subscribers live in a ref: a new subscriber must never re-open the socket.
  const handlers = useRef(new Map<ApiEventType, Set<EventHandler>>());

  const subscribe = useCallback((type: ApiEventType, handler: EventHandler) => {
    const forType = handlers.current.get(type) ?? new Set<EventHandler>();
    forType.add(handler);
    handlers.current.set(type, forType);
    return () => {
      forType.delete(handler);
    };
  }, []);

  const connected = sessionStatus === 'authenticated';

  useEffect(() => {
    if (!connected) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let degrade: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    /** Report `reconnecting`, but only if the drop outlives a normal auto-reconnect. */
    const markDegraded = () => {
      if (degrade !== undefined) return; // already counting down
      degrade = setTimeout(() => {
        if (!disposed) setStatus('reconnecting');
      }, DEGRADED_AFTER_MS);
    };

    const markHealthy = () => {
      if (degrade !== undefined) {
        clearTimeout(degrade);
        degrade = undefined;
      }
      setStatus('open');
    };

    const open = () => {
      if (disposed) return;
      const next = new EventSource(`${API_ORIGIN}/v1/events`);
      source = next;

      next.onopen = () => {
        attempt = 0; // a real connection resets the backoff window
        markHealthy();
      };

      next.onerror = () => {
        // CONNECTING ⇒ EventSource is retrying a transient drop on its own; let it.
        if (next.readyState === EventSource.CONNECTING) {
          markDegraded();
          return;
        }
        // CLOSED ⇒ it gave up for good (e.g. a 401). Nothing will happen unless we act.
        next.close();
        if (disposed) return;
        markDegraded();
        const delay = backoffDelay(attempt);
        attempt += 1;
        retry = setTimeout(open, delay);
      };

      for (const type of API_EVENT_TYPES) {
        next.addEventListener(type, ((event: MessageEvent<string>) => {
          const data = parseData(event.data);
          if (data === undefined) return;
          for (const handler of handlers.current.get(type) ?? []) handler(data);
        }) as EventListener);
      }
    };

    open();

    return () => {
      disposed = true;
      if (retry !== undefined) clearTimeout(retry);
      if (degrade !== undefined) clearTimeout(degrade);
      source?.close();
    };
  }, [connected]);

  const value = useMemo<EventsContextValue>(() => ({ status, subscribe }), [status, subscribe]);
  return createElement(EventsContext.Provider, { value }, children);
}

/**
 * Subscribe to one event type for the lifetime of the calling component. Returns nothing — handlers
 * drive state. A no-op when no {@link EventsProvider} is mounted, so a component under test renders
 * without one.
 */
export function useApiEvent(type: ApiEventType, handler: EventHandler): void {
  const context = useContext(EventsContext);
  // Keep the latest handler without re-subscribing on every render.
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (context === undefined) return;
    return context.subscribe(type, (data) => latest.current(data));
  }, [context, type]);
}

/** The live connection's status, for UI that must not silently go stale. */
export function useEventsStatus(): ConnectionStatus {
  return useContext(EventsContext)?.status ?? 'connecting';
}

// --- Scan progress (F-038) ------------------------------------------------------------------------

export interface SourceScanProgress {
  running: boolean;
  /** Changed paths processed so far — counted server-side, per source (F-081). Never regresses. */
  processed: number;
  /** Changed paths this scan will process, known once the diff is done. `0` = nothing changed. */
  total: number;
  /** The last completed scan's counts (authoritative once running is false). */
  lastSummary?: ScanSummary;
  /** ISO time the last scan completed. */
  at?: string;
  /** Why the last scan failed. The scan runs in the background, so this is how the failure lands. */
  error?: string;
}

export interface ScanEventsState {
  bySource: Record<string, SourceScanProgress>;
}

export type ScanEvent =
  | { type: 'source.scan.started'; sourceId: string; total: number }
  | { type: 'source.scan.progress'; sourceId: string; processed: number; total: number }
  | { type: 'source.scan.failed'; sourceId: string; error: string }
  | { type: 'source.scan.completed'; sourceId: string; summary: ScanSummary; at: string };

export const initialScanEventsState: ScanEventsState = { bySource: {} };

/**
 * Fold one SSE event into the live scan-progress state. Pure — the unit test drives this directly.
 *
 * F-081 replaced a heuristic here. Progress used to be inferred by counting `document.ingested` and
 * attributing it to "whatever source is running", which was wrong three ways: it broke with two
 * concurrent scans, it silently under-counted (the worker emits nothing for an unchanged-hash
 * document, so a no-op re-scan stalled the count at 0), and under a non-default tenant it stayed at
 * 0 entirely because `document.*` is attributed to the tenant ingestion actually wrote to (ADR-0050
 * / F-071). The server now counts per source and says so, and `source.scan.progress` carries the
 * owning tenant — so the count is real, exact, and tenant-correct.
 */
export function scanEventsReducer(state: ScanEventsState, event: ScanEvent): ScanEventsState {
  const prev = state.bySource[event.sourceId];
  switch (event.type) {
    case 'source.scan.started':
      return {
        bySource: {
          ...state.bySource,
          [event.sourceId]: { running: true, processed: 0, total: event.total },
        },
      };
    case 'source.scan.progress':
      return {
        bySource: {
          ...state.bySource,
          [event.sourceId]: {
            ...prev,
            running: true,
            processed: event.processed,
            total: event.total,
          },
        },
      };
    case 'source.scan.failed':
      return {
        bySource: {
          ...state.bySource,
          [event.sourceId]: {
            ...prev,
            running: false,
            processed: prev?.processed ?? 0,
            total: prev?.total ?? 0,
            error: event.error,
          },
        },
      };
    case 'source.scan.completed': {
      const total = event.summary.added + event.summary.modified + event.summary.removed;
      return {
        bySource: {
          ...state.bySource,
          [event.sourceId]: {
            running: false,
            // Completed means completed: land the bar on total rather than leaving it wherever the
            // last progress frame happened to be.
            processed: total,
            total,
            lastSummary: event.summary,
            at: event.at,
          },
        },
      };
    }
    default:
      return state;
  }
}

function isScanSummary(value: unknown): value is ScanSummary {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['added'] === 'number' &&
    typeof record['modified'] === 'number' &&
    typeof record['removed'] === 'number' &&
    typeof record['unchanged'] === 'number'
  );
}

/**
 * Subscribe to live scan progress over the shared connection and return the per-source progress map.
 *
 * All four `source.scan.*` events carry the owning tenant from the registry record, so — unlike the
 * `document.*` cue this replaced — progress is tenant-correct today and does not wait on F-071.
 */
export function useScanEvents(): ScanEventsState {
  const [state, dispatch] = useReducer(scanEventsReducer, initialScanEventsState);

  useApiEvent('source.scan.started', (data) => {
    const sourceId = data['sourceId'];
    const total = data['total'];
    if (typeof sourceId === 'string' && typeof total === 'number') {
      dispatch({ type: 'source.scan.started', sourceId, total });
    }
  });

  useApiEvent('source.scan.progress', (data) => {
    const sourceId = data['sourceId'];
    const processed = data['processed'];
    const total = data['total'];
    if (
      typeof sourceId === 'string' &&
      typeof processed === 'number' &&
      typeof total === 'number'
    ) {
      dispatch({ type: 'source.scan.progress', sourceId, processed, total });
    }
  });

  useApiEvent('source.scan.failed', (data) => {
    const sourceId = data['sourceId'];
    const error = data['error'];
    if (typeof sourceId === 'string' && typeof error === 'string') {
      dispatch({ type: 'source.scan.failed', sourceId, error });
    }
  });

  useApiEvent('source.scan.completed', (data) => {
    const sourceId = data['sourceId'];
    const summary = data['summary'];
    if (typeof sourceId === 'string' && isScanSummary(summary)) {
      dispatch({ type: 'source.scan.completed', sourceId, summary, at: new Date().toISOString() });
    }
  });

  return state;
}

// --- Live activity (F-042 timeline, F-060 Overview feed + bell) -----------------------------------

/** Event types surfaced on the live activity feed (FR-43 timeline). */
export const LIVE_ACTIVITY_TYPES = [
  'memory.captured',
  'document.ingested',
  'source.scan.completed',
] as const;

export type LiveActivityType = (typeof LIVE_ACTIVITY_TYPES)[number];

/** Event types surfaced on the Overview feed + notifications bell (F-060) — adds scan lifecycle. */
export const FEED_EVENT_TYPES = [
  'memory.captured',
  'document.ingested',
  'document.removed',
  'source.scan.started',
  'source.scan.completed',
] as const;

export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

export interface LiveEvent {
  /** Stable id for the received event (monotonic within the session). */
  id: string;
  type: LiveActivityType;
  /** Client receive time (ISO) — the wire payloads carry no timestamp. */
  at: string;
  data: Record<string, unknown>;
}

/**
 * Subscribe to the live activity stream and accumulate the most recent events (newest first,
 * capped). Feeds the timeline's live-append (FR-43).
 */
export function useLiveActivity(limit = 50): LiveEvent[] {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const seq = useRef(0);

  const append = useCallback(
    (type: LiveActivityType, data: Record<string, unknown>) => {
      const entry: LiveEvent = {
        id: `${type}-${Date.now()}-${seq.current++}`,
        type,
        at: new Date().toISOString(),
        data,
      };
      setEvents((prev) => [entry, ...prev].slice(0, limit));
    },
    [limit],
  );

  useApiEvent('memory.captured', (data) => append('memory.captured', data));
  useApiEvent('document.ingested', (data) => append('document.ingested', data));
  useApiEvent('source.scan.completed', (data) => append('source.scan.completed', data));

  return events;
}
