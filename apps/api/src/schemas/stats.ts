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
