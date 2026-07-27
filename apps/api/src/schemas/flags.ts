import { z } from 'zod/v4';

/**
 * Zod schemas for `GET /v1/flags` (F-058; FR-57, ADR-0061 §1) — the single source of validation,
 * serialization and OpenAPI.
 *
 * The response is the caller's **evaluated** view, not the catalog: every flag carries the value that
 * applies to *this* tenant, plus the rule that decided it. Returning the raw definitions instead
 * would put every other tenant's rollout on the wire, which is both a leak and useless to the caller.
 *
 * Tenancy stays off the wire (ADR-0033): the evaluated tenant comes from the caller's credentials.
 *
 * **Read-only, deliberately.** There is no write route and the dashboard renders no toggle: flags are
 * declared in config, and a control that cannot change anything is worse than no control (ADR-0022).
 */

const flagEvaluationSchema = z.object({
  key: z.string().describe('Stable flag identifier, e.g. `beta.search`.'),
  description: z.string().describe('What turning this flag on does. May be empty.'),
  enabled: z.boolean().describe('The value that applies to the calling tenant.'),
  source: z
    .enum(['default', 'tenant-override'])
    .describe(
      'Which rule decided the value: the flag default, or an explicit entry for this tenant.',
    ),
});

export const flagsResponseSchema = z.object({
  flags: z
    .array(flagEvaluationSchema)
    .describe(
      'Every declared flag, evaluated for the calling tenant. Empty when none are declared.',
    ),
});

export type FlagsResponse = z.infer<typeof flagsResponseSchema>;
