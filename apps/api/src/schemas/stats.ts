import { z } from 'zod/v4';

/**
 * Zod schema for `GET /v1/stats` (F-060; FR-38/FR-62) — the single source of validation +
 * serialization + OpenAPI, and the shape the `get_stats` MCP tool returns (ADR-0036 parity).
 *
 * The response is deliberately **token-lean**: flat numbers, no labels, no prose. An agent reading
 * it pays for every token, and the dashboard supplies its own labels. Tenancy stays off the wire
 * (ADR-0033) — the caller's tenant is resolved from its credentials, never echoed back.
 *
 * **No trend/delta fields, by design.** Rendering a change-vs-prior-period would require a snapshot
 * of past counts; nothing stores one (the graph has no per-node `createdAt`, and the ingestion
 * manifest holds only `path → contentHash`). Deriving one from `createdAt` would silently lie in any
 * deployment using retention (FR-15), which *deletes*. A trend belongs to analytics (FR-47), not
 * here — so this schema carries only what the system can actually prove.
 */
export const statsResponseSchema = z.object({
  /** Distinct documents indexed across this tenant's registered sources. */
  documents: z.number().int().nonnegative(),
  /** Current (non-superseded) memories this tenant holds. */
  memories: z.number().int().nonnegative(),
  graph: z.object({
    /** Nodes of every kind (file/symbol/module/person/decision/memory). */
    nodes: z.number().int().nonnegative(),
    /** Effect-link edges specifically (FR-18) — the subset the Overview reports. */
    effectLinks: z.number().int().nonnegative(),
  }),
  /** Sources registered to this tenant. */
  sources: z.number().int().nonnegative(),
  /**
   * When one of this tenant's sources last completed a scan — `null` if none has **in this server
   * process**. Scan status is in-memory (F-038), so a restart resets this to `null` even though
   * scans happened; nothing persists a scan timestamp today. Nullable rather than omitted so a
   * client can tell "no scan this session" apart from a field it failed to parse. Clients must not
   * render it as "never scanned".
   */
  lastScanAt: z.string().nullable(),
});

export type StatsResponse = z.infer<typeof statsResponseSchema>;

/** `GET /v1/stats/activity` querystring (F-084/F-088). Values arrive as strings. */
export const activityQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional(),
  /**
   * The viewer's UTC offset in minutes **east** of UTC (JS: `-new Date().getTimezoneOffset()`),
   * so the buckets are the viewer's calendar days (F-088). Omitted ⇒ UTC days. Bounded to the real
   * range of world timezones (UTC-12:00 … UTC+14:00). This is a **fixed** offset applied to the
   * whole window — across a DST transition inside it, hours near the boundary can land one day
   * off; stated here rather than silently wrong (the store has no tz database to do better).
   */
  tzOffset: z.coerce.number().int().min(-720).max(840).optional(),
});

/**
 * `GET /v1/stats/activity` response (F-084; ADR-0053 clause 3) — a zero-filled daily activity series,
 * in the viewer's calendar days when `tzOffset` is sent (F-088), UTC days otherwise.
 *
 * `from` is the window start the server **actually used** (`max(requested, oldest retained event)`),
 * not the requested one: the trail is pruned, so anchoring on its real floor is what stops the chart
 * drawing a pruned day as a zero. The client must label `from`. `points` is empty when the trail has
 * no history — the chart then does not render (no fabricated flat line).
 *
 * This is deliberately **not** on `/v1/stats` and has **no MCP tool** (ADR-0053): an agent has no use
 * for a histogram, and `/v1/stats` keeps its documented refusal to carry trend fields.
 */
export const activityResponseSchema = z.object({
  from: z.string(),
  until: z.string(),
  points: z.array(z.object({ date: z.string(), count: z.number().int().nonnegative() })),
});

export type ActivityResponse = z.infer<typeof activityResponseSchema>;
export type ActivityQueryString = z.infer<typeof activityQuerySchema>;
