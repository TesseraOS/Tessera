import { z } from 'zod/v4';

/**
 * Zod schemas for `/v1/sources*` (F-038; FR-62) — the single source of validation + serialization +
 * OpenAPI. `config` is the connector-specific settings (today: `{ root }` for filesystem/git); the `kind`
 * is validated by the composition root's connector factory, so an unsupported kind surfaces as a 400
 * (VALIDATION) rather than being enumerated here (no api↔config catalog duplication).
 */

/** Connector-specific source configuration (filesystem/git both take a working-tree `root`). */
export const sourceConfigSchema = z.object({
  root: z.string().min(1),
});

/** `POST /v1/sources` body — register a source the runtime can scan. */
export const registerSourceBodySchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1).optional(),
  config: sourceConfigSchema,
});

/** Path parameter shared by the single-source routes. */
export const sourceIdParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * A registered source (tenancy stays off the wire — ADR-0033). `config` is returned as an opaque,
 * connector-specific bag (validated strictly on the way in via {@link registerSourceBodySchema}).
 */
export const sourceSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  config: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

/** `GET /v1/sources` response. */
export const sourceListResponseSchema = z.object({ sources: z.array(sourceSchema) });

/** Counts of what a scan changed. */
export const scanSummarySchema = z.object({
  added: z.number().int(),
  modified: z.number().int(),
  removed: z.number().int(),
  unchanged: z.number().int(),
});

/** `POST /v1/sources/:id/scan` response — the source plus what changed. */
export const scanResultResponseSchema = z.object({
  source: sourceSchema,
  summary: scanSummarySchema,
});

/** `GET /v1/sources/:id/scan` response — the source's most recent scan status. */
export const scanStatusResponseSchema = z.object({
  state: z.enum(['idle', 'running', 'error']),
  lastScan: z.object({ summary: scanSummarySchema, at: z.string() }).optional(),
  error: z.string().optional(),
});

/** `DELETE /v1/sources/:id` response. */
export const removeSourceResponseSchema = z.object({ id: z.string() });

export type RegisterSourceBody = z.infer<typeof registerSourceBodySchema>;
export type SourceIdParam = z.infer<typeof sourceIdParamSchema>;
