import { z } from 'zod/v4';
import { retrieverKindSchema } from './common.js';

/** `POST /v1/search` request body. */
export const searchBodySchema = z.object({
  query: z.string().min(1).describe('Natural-language or symbol query.'),
  limit: z.number().int().positive().max(100).optional().describe('Max candidates to return.'),
});

/** How one retrieval signal contributed to a fused candidate (per-candidate attribution, FR-26). */
export const signalContributionSchema = z.object({
  signal: retrieverKindSchema,
  rank: z.number().int(),
  score: z.number(),
  weight: z.number(),
  contribution: z.number(),
});

/** One item in the fused, ranked result set. */
export const fusedCandidateSchema = z.object({
  ref: z.string(),
  score: z.number(),
  signals: z.array(signalContributionSchema),
  label: z.string().optional(),
});

/** `POST /v1/search` response. */
export const searchResponseSchema = z.object({
  results: z.array(fusedCandidateSchema),
});

export type SearchBody = z.infer<typeof searchBodySchema>;
