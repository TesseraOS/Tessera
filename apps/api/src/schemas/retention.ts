import { MEMORY_KINDS } from '@tessera/memory';
import { z } from 'zod/v4';

/**
 * One effective memory-retention rule (FR-15) as the server resolved it from config — thresholds are in
 * **ms** here (config authors them in days). A rule matches by `kind`/`scope` (absent ⇒ matches all);
 * the most-specific matching rule wins.
 */
export const retentionRuleSchema = z.object({
  kind: z.enum(MEMORY_KINDS).optional(),
  scope: z.string().optional(),
  maxAgeMs: z
    .number()
    .optional()
    .describe('Expire a lineage whose current version is older than this.'),
  maxSupersededVersions: z
    .number()
    .int()
    .optional()
    .describe('Keep at most this many superseded versions per lineage.'),
  maxSupersededAgeMs: z.number().optional().describe('Prune superseded versions older than this.'),
});

/** `GET /v1/retention` response — the deployment's effective policy. Empty `rules` ⇒ retention is off. */
export const retentionPolicyResponseSchema = z.object({
  rules: z.array(retentionRuleSchema),
});

/** `POST /v1/retention/prune` response — what the pass removed for the calling tenant. */
export const retentionPruneResponseSchema = z.object({
  expiredLineages: z
    .number()
    .int()
    .nonnegative()
    .describe('Whole lineages deleted by an age-based expiry.'),
  prunedVersions: z.number().int().nonnegative().describe('Superseded versions compacted away.'),
});
