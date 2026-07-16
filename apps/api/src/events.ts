import { createEventBus, type EventBus, type TenantId } from '@tessera/core';

/**
 * Every SSE payload carries the tenant it belongs to (ADR-0050). **Required, never optional:** an
 * optional field is a filter that silently fails open, and requiring it means TypeScript asks "whose
 * event is this?" at every emit site — including the next one somebody adds.
 *
 * This field is **server-side only**. {@link sseFrame} strips it before the wire, so tenancy never
 * appears in a response (ADR-0033) and the public event shape is unchanged.
 */
interface TenantScoped {
  readonly tenantId: TenantId;
}

/**
 * Live-update events the API streams to clients over SSE (FR-38): ingest progress and new memories.
 * Payloads are small, JSON-safe, and non-sensitive (never raw ingested content or secrets) — but
 * they DO carry `path`/`title`/`label`, which is one tenant's business and not another's. Hence
 * {@link TenantScoped} + the filter in the `/v1/events` route (ADR-0050).
 */
export interface ApiEventMap extends Record<string, unknown> {
  readonly 'document.ingested': TenantScoped & {
    readonly ref: string;
    readonly path: string;
    readonly kind: string;
  };
  readonly 'document.removed': TenantScoped & { readonly ref: string; readonly path: string };
  readonly 'memory.captured': TenantScoped & {
    readonly lineageId: string;
    readonly kind: string;
    readonly title: string;
  };
  /** A source scan started (F-038). */
  readonly 'source.scan.started': TenantScoped & {
    readonly sourceId: string;
    readonly kind: string;
    readonly label: string;
  };
  /** A source scan finished, with what changed (F-038). Counts only — non-sensitive. */
  readonly 'source.scan.completed': TenantScoped & {
    readonly sourceId: string;
    readonly kind: string;
    readonly label: string;
    readonly summary: {
      readonly added: number;
      readonly modified: number;
      readonly removed: number;
      readonly unchanged: number;
    };
  };
}

/** The event names streamed over `/v1/events` (the SSE route subscribes to each). */
export const API_EVENT_TYPES = [
  'document.ingested',
  'document.removed',
  'memory.captured',
  'source.scan.started',
  'source.scan.completed',
] as const satisfies readonly (keyof ApiEventMap)[];

export type ApiEventType = (typeof API_EVENT_TYPES)[number];

/** The in-process bus producers (routes now, the ingestion worker later) emit onto. */
export type ApiEventBus = EventBus<ApiEventMap>;

/** Create an {@link ApiEventBus}. The composition root shares one across the server + producers. */
export function createApiEventBus(): ApiEventBus {
  return createEventBus<ApiEventMap>();
}

/**
 * Format a named SSE event frame: `event: <type>\ndata: <json>\n\n`.
 *
 * **Strips `tenantId`** (ADR-0050/ADR-0033): it is how the route decides who may receive an event,
 * not something a client is told. Doing it here rather than at the call site means the wire shape
 * cannot regress if another producer starts writing frames — there is exactly one way out.
 */
export function sseFrame(type: string, data: unknown): string {
  const payload =
    typeof data === 'object' && data !== null && 'tenantId' in data
      ? Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'tenantId'))
      : data;
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/** Format an SSE comment line (used for the opening handshake + heartbeats): `: <text>\n\n`. */
export function sseComment(text: string): string {
  return `: ${text}\n\n`;
}
