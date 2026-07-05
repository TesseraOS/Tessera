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

/** A node reference (kind + key) used when asserting an effect-link. */
const effectNodeRefSchema = z.object({
  kind: z.enum(NODE_KINDS),
  key: z.string().min(1),
});

/**
 * `POST /v1/effects` body — manually assert an effect-link "changing `from` may require reviewing `to`"
 * (FR-17/18). `origin` is fixed to `manual` server-side (clients cannot forge `static`/`learned`).
 */
export const assertEffectBodySchema = z.object({
  from: effectNodeRefSchema,
  to: effectNodeRefSchema,
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  metadata: metadataSchema.optional(),
});

/** `POST /v1/effects` response — the asserted effect-link edge. */
export const effectLinkSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.string(),
  rationale: z.string().nullable(),
  confidence: z.number().nullable(),
  origin: z.string().nullable(),
  metadata: metadataSchema,
});

export type EffectsQuery = z.infer<typeof effectsQuerySchema>;
export type AssertEffectBody = z.infer<typeof assertEffectBodySchema>;
