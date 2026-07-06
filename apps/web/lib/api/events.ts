'use client';

import { useEffect, useReducer, useState } from 'react';
import { API_ORIGIN } from './client';
import type { ScanSummary } from './types';

/**
 * Live source-scan progress from the `GET /v1/events` SSE stream (FR-38) — the dashboard's first
 * SSE consumer. The transport is a thin hook; the state math is a **pure reducer** so it can be
 * unit-tested offline (no live socket). The stream carries scan lifecycle + `document.ingested`
 * events; `document.ingested` is not attributed to a source on the wire, so — because the Local
 * runtime scans one source at a time (synchronous) — it is counted against whichever source(s) are
 * currently running. Counts are a live progress cue; the authoritative result is the scan summary.
 */

export interface SourceScanProgress {
  running: boolean;
  /** Documents ingested observed while this source's scan was running (live cue). */
  ingested: number;
  /** The last completed scan's counts (authoritative once running is false). */
  lastSummary?: ScanSummary;
  /** ISO time the last scan completed. */
  at?: string;
}

export interface ScanEventsState {
  bySource: Record<string, SourceScanProgress>;
}

export type ScanEvent =
  | { type: 'source.scan.started'; sourceId: string }
  | { type: 'source.scan.completed'; sourceId: string; summary: ScanSummary; at: string }
  | { type: 'document.ingested' };

export const initialScanEventsState: ScanEventsState = { bySource: {} };

/** Fold one SSE event into the live scan-progress state. Pure — the unit test drives this directly. */
export function scanEventsReducer(state: ScanEventsState, event: ScanEvent): ScanEventsState {
  switch (event.type) {
    case 'source.scan.started':
      return {
        bySource: { ...state.bySource, [event.sourceId]: { running: true, ingested: 0 } },
      };
    case 'document.ingested': {
      // Attribute to whatever is running (one at a time on Local). No running source → ignore.
      const bySource = { ...state.bySource };
      let changed = false;
      for (const [id, progress] of Object.entries(bySource)) {
        if (progress.running) {
          bySource[id] = { ...progress, ingested: progress.ingested + 1 };
          changed = true;
        }
      }
      return changed ? { bySource } : state;
    }
    case 'source.scan.completed': {
      const prev = state.bySource[event.sourceId];
      return {
        bySource: {
          ...state.bySource,
          [event.sourceId]: {
            running: false,
            ingested: prev?.ingested ?? 0,
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

/**
 * Subscribe to live scan progress. Opens one `EventSource` to `/v1/events`, reduces the scan
 * lifecycle events, and returns the per-source progress map. SSR-safe (no socket on the server) and
 * torn down on unmount.
 */
export function useScanEvents(): ScanEventsState {
  const [state, dispatch] = useReducer(scanEventsReducer, initialScanEventsState);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    const source = new EventSource(`${API_ORIGIN}/v1/events`);

    const onStarted = (event: MessageEvent<string>) => {
      const data = parseData(event.data);
      const sourceId = data?.['sourceId'];
      if (typeof sourceId === 'string') dispatch({ type: 'source.scan.started', sourceId });
    };
    const onCompleted = (event: MessageEvent<string>) => {
      const data = parseData(event.data);
      const sourceId = data?.['sourceId'];
      const summary = data?.['summary'];
      if (typeof sourceId === 'string' && isScanSummary(summary)) {
        dispatch({
          type: 'source.scan.completed',
          sourceId,
          summary,
          at: new Date().toISOString(),
        });
      }
    };
    const onIngested = () => dispatch({ type: 'document.ingested' });

    source.addEventListener('source.scan.started', onStarted as EventListener);
    source.addEventListener('source.scan.completed', onCompleted as EventListener);
    source.addEventListener('document.ingested', onIngested as EventListener);

    return () => {
      source.removeEventListener('source.scan.started', onStarted as EventListener);
      source.removeEventListener('source.scan.completed', onCompleted as EventListener);
      source.removeEventListener('document.ingested', onIngested as EventListener);
      source.close();
    };
  }, []);

  return state;
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

/** Event types surfaced on the live activity feed (FR-43 timeline). */
export const LIVE_ACTIVITY_TYPES = [
  'memory.captured',
  'document.ingested',
  'source.scan.completed',
] as const;

export type LiveActivityType = (typeof LIVE_ACTIVITY_TYPES)[number];

export interface LiveEvent {
  /** Stable id for the received event (monotonic within the session). */
  id: string;
  type: LiveActivityType;
  /** Client receive time (ISO) — the wire payloads carry no timestamp. */
  at: string;
  data: Record<string, unknown>;
}

/**
 * Subscribe to the live activity stream (`/v1/events`) and accumulate the most recent events
 * (newest first, capped). Feeds the timeline's live-append (FR-43). SSR-safe; torn down on unmount.
 */
export function useLiveActivity(limit = 50): LiveEvent[] {
  const [events, setEvents] = useState<LiveEvent[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    const source = new EventSource(`${API_ORIGIN}/v1/events`);
    let seq = 0;

    const listeners = LIVE_ACTIVITY_TYPES.map((type) => {
      const handler = (event: MessageEvent<string>) => {
        const data = parseData(event.data) ?? {};
        const entry: LiveEvent = {
          id: `${type}-${Date.now()}-${seq++}`,
          type,
          at: new Date().toISOString(),
          data,
        };
        setEvents((prev) => [entry, ...prev].slice(0, limit));
      };
      source.addEventListener(type, handler as EventListener);
      return { type, handler };
    });

    return () => {
      for (const { type, handler } of listeners) {
        source.removeEventListener(type, handler as EventListener);
      }
      source.close();
    };
  }, [limit]);

  return events;
}
