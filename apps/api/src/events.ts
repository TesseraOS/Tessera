import { createEventBus, type EventBus } from '@tessera/core';

/**
 * Live-update events the API streams to clients over SSE (FR-38): ingest progress and new memories.
 * Payloads are small, JSON-safe, and non-sensitive (never raw ingested content or secrets).
 */
export interface ApiEventMap extends Record<string, unknown> {
  readonly 'document.ingested': {
    readonly ref: string;
    readonly path: string;
    readonly kind: string;
  };
  readonly 'document.removed': { readonly ref: string; readonly path: string };
  readonly 'memory.captured': {
    readonly lineageId: string;
    readonly kind: string;
    readonly title: string;
  };
}

/** The event names streamed over `/v1/events` (the SSE route subscribes to each). */
export const API_EVENT_TYPES = [
  'document.ingested',
  'document.removed',
  'memory.captured',
] as const satisfies readonly (keyof ApiEventMap)[];

export type ApiEventType = (typeof API_EVENT_TYPES)[number];

/** The in-process bus producers (routes now, the ingestion worker later) emit onto. */
export type ApiEventBus = EventBus<ApiEventMap>;

/** Create an {@link ApiEventBus}. The composition root shares one across the server + producers. */
export function createApiEventBus(): ApiEventBus {
  return createEventBus<ApiEventMap>();
}

/** Format a named SSE event frame: `event: <type>\ndata: <json>\n\n`. */
export function sseFrame(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Format an SSE comment line (used for the opening handshake + heartbeats): `: <text>\n\n`. */
export function sseComment(text: string): string {
  return `: ${text}\n\n`;
}
