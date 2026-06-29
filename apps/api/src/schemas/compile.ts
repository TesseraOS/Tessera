import { z } from 'zod/v4';
import { metadataSchema, retrieverKindSchema } from './common.js';

/** `POST /v1/compile` request body (FR-27). */
export const compileBodySchema = z.object({
  task: z.string().min(1).describe('The task context is being compiled for.'),
  budget: z.number().int().positive().describe('Max tokens the package may occupy.'),
  retrievalLimit: z.number().int().positive().max(200).optional(),
  filters: z
    .object({ kinds: z.array(z.string().min(1)).optional() })
    .optional()
    .describe('Restrict fragments to these kinds.'),
});

const fragmentProvenanceSchema = z.object({
  retrievalScore: z.number(),
  signals: z.array(retrieverKindSchema),
  expandedFrom: z.string().optional(),
  source: metadataSchema.optional(),
});

const contextFragmentSchema = z.object({
  ref: z.string(),
  text: z.string(),
  kind: z.string(),
  tokens: z.number().int(),
  score: z.number(),
  provenance: fragmentProvenanceSchema,
  whyIncluded: z.string(),
});

const contextSectionSchema = z.object({
  title: z.string(),
  fragments: z.array(contextFragmentSchema),
});

const traceDropSchema = z.object({ ref: z.string(), reason: z.string() });

const traceStageSchema = z.object({
  stage: z.string(),
  inputCount: z.number().int(),
  outputCount: z.number().int(),
  dropped: z.array(traceDropSchema),
  notes: z.string().optional(),
});

const compilationTraceSchema = z.object({ stages: z.array(traceStageSchema) });

const packageScoresSchema = z.object({
  fragmentCount: z.number().int(),
  budgetAdherence: z.number(),
  provenanceCoverage: z.number(),
  redundancy: z.number(),
});

/** `POST /v1/compile` response — the provenance-tagged, budget-bounded Context Package (FR-28). */
export const contextPackageSchema = z.object({
  task: z.string(),
  budget: z.number().int(),
  sections: z.array(contextSectionSchema),
  totalTokens: z.number().int(),
  trace: compilationTraceSchema,
  scores: packageScoresSchema,
});

export type CompileBody = z.infer<typeof compileBodySchema>;
