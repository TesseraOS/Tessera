import { z } from 'zod/v4';
import { NODE_KINDS } from '@tessera/knowledge-graph';
import { metadataSchema } from './common.js';

/** `GET /v1/effects` querystring (get_effects, FR-19). `maxDepth` arrives as a string → coerced. */
export const effectsQuerySchema = z.object({
  kind: z.enum(NODE_KINDS).describe('Kind of the node whose dependents to find.'),
  key: z.string().min(1).describe('Natural key of the node (e.g. a file path or symbol).'),
  maxDepth: z.coerce.number().int().positive().max(20).optional(),
});

const graphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(NODE_KINDS),
  key: z.string(),
  label: z.string(),
  metadata: metadataSchema,
});

/** One affected node with the path that reaches it and a score (FR-19). */
const effectHitSchema = z.object({
  nodeId: z.string(),
  node: graphNodeSchema,
  path: z.array(z.string()),
  distance: z.number().int(),
  score: z.number(),
});

/** `GET /v1/effects` response — ranked dependents with paths. */
export const effectsResponseSchema = z.object({
  effects: z.array(effectHitSchema),
});

export type EffectsQuery = z.infer<typeof effectsQuerySchema>;
