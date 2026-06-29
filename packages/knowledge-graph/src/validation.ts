import { z } from 'zod';
import { EFFECT_ORIGINS, NODE_KINDS, STRUCTURAL_EDGE_KINDS } from './domain.js';

/** Confidence assigned to a manually-asserted effect-link when none is given (human-asserted). */
export const DEFAULT_MANUAL_CONFIDENCE = 1;

const metadataSchema = z.record(z.unknown());

/** A reference to a node by its natural `(kind, key)` — resolved to a deterministic id by the service. */
export const nodeRefSchema = z.object({
  kind: z.enum(NODE_KINDS),
  key: z.string().min(1),
});

/** Schema for upserting a node (FR-16). */
export const upsertNodeSchema = z.object({
  kind: z.enum(NODE_KINDS),
  key: z.string().min(1),
  label: z.string().min(1),
  metadata: metadataSchema.default({}),
});

/** Schema for upserting a structural edge (effect-links go through {@link assertEffectLinkSchema}). */
export const upsertEdgeSchema = z.object({
  from: nodeRefSchema,
  to: nodeRefSchema,
  kind: z.enum(STRUCTURAL_EDGE_KINDS),
  metadata: metadataSchema.default({}),
});

/** Schema for asserting an effect-link manually (FR-17/18). */
export const assertEffectLinkSchema = z.object({
  from: nodeRefSchema,
  to: nodeRefSchema,
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1).default(DEFAULT_MANUAL_CONFIDENCE),
  origin: z.enum(EFFECT_ORIGINS).default('manual'),
  metadata: metadataSchema.default({}),
});

export type NodeRef = z.input<typeof nodeRefSchema>;
export type UpsertNodeInput = z.input<typeof upsertNodeSchema>;
export type UpsertEdgeInput = z.input<typeof upsertEdgeSchema>;
export type AssertEffectLinkInput = z.input<typeof assertEffectLinkSchema>;
