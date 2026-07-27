import { z } from 'zod/v4';
import { DEFAULT_USAGE_DAYS, MAX_USAGE_DAYS } from '../usage/summary.js';

/**
 * Zod schemas for `GET /v1/usage` (F-057; FR-47, NFR-12) — the single source of validation,
 * serialization and OpenAPI.
 *
 * **There is no MCP `get_usage` tool, deliberately** (ADR-0060 §8). An agent has no use for a usage
 * histogram; `get_stats` already answers "what does this workspace hold", and every field an agent
 * could act on (its effective budget) is already on the compile response. Stated here so the absence
 * reads as a decision rather than an oversight — the same posture `stats.ts` takes about trends.
 *
 * Tenancy stays off the wire (ADR-0033): the caller's tenant comes from its credentials.
 */

export const usageQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_USAGE_DAYS)
    .optional()
    .describe(
      `Window length in days (default ${String(DEFAULT_USAGE_DAYS)}, max ${String(MAX_USAGE_DAYS)}).`,
    ),
});

export type UsageQueryString = z.infer<typeof usageQuerySchema>;

/**
 * Mean + max, never a percentile.
 *
 * The store holds `count`, `sumDurationMs` and `maxDurationMs`, and a sum and a max **cannot**
 * produce a p95 (ADR-0060 §3). The field names say what the numbers are so a client cannot render a
 * mean under a percentile's label. Real percentiles live in the gated `bench` suite (NFR-4).
 */
const usageLatencySchema = z
  .object({
    avgMs: z.number().nonnegative().describe('Mean duration over the window. Not a percentile.'),
    maxMs: z.number().nonnegative().describe('The slowest single occurrence in the window.'),
  })
  .nullable();

export const usageResponseSchema = z.object({
  from: z
    .string()
    .describe(
      'The window start the server ACTUALLY used — clamped to the earliest day the usage store ' +
        'holds. Clients must label this, never the requested window: rendering days the store ' +
        'cannot speak for would draw zeros that read as "nothing happened".',
    ),
  until: z.string().describe('The window end (inclusive), as a UTC day.'),
  totals: z.object({
    compiles: z.number().int().nonnegative(),
    searches: z.number().int().nonnegative(),
    documentsIngested: z.number().int().nonnegative(),
    memoriesWritten: z.number().int().nonnegative(),
    tokensCompiled: z.number().int().nonnegative(),
  }),
  entitlement: z
    .object({
      maxMonthlyCompiles: z.number().int().describe('`-1` means unlimited.'),
      compilesUsed: z
        .number()
        .int()
        .nonnegative()
        .describe('Compiles spent this UTC calendar month, across every project in the tenant.'),
      periodStart: z.string(),
      periodEnd: z.string(),
    })
    .nullable()
    .describe(
      '`null` on an unmetered deployment — there is no entitlement to report (ADR-0060 §1).',
    ),
  latency: z.object({
    compile: usageLatencySchema,
    search: usageLatencySchema,
  }),
  quality: z
    .object({
      avgBudgetAdherence: z.number(),
      avgProvenanceCoverage: z.number(),
    })
    .nullable()
    .describe(
      '`null` when no compile in the window carried scores. A zero average would be a claim about ' +
        'compiles that never happened.',
    ),
  daily: z
    .array(
      z.object({
        date: z.string().describe('UTC calendar day, `YYYY-MM-DD`.'),
        compiles: z.number().int().nonnegative(),
        searches: z.number().int().nonnegative(),
        documentsIngested: z.number().int().nonnegative(),
        tokensCompiled: z.number().int().nonnegative(),
      }),
    )
    .describe(
      'One point per day that has usage — sparse, not zero-filled, and bucketed by UTC day. This ' +
        'deliberately differs from /v1/stats/activity, which buckets into the viewer’s offset ' +
        '(F-088); pre-aggregated buckets cannot be re-split for half-hour offsets, so the analytics ' +
        'view labels its axis UTC.',
    ),
});

export type UsageResponse = z.infer<typeof usageResponseSchema>;
