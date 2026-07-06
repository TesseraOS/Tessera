import { z } from 'zod/v4';
import { EDGE_KINDS, NODE_KINDS } from '@tessera/knowledge-graph';
import { metadataSchema } from './common.js';

/** A knowledge-graph node on the wire (FR-42). Mirrors the domain `GraphNode`. */
export const graphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(NODE_KINDS),
  key: z.string(),
  label: z.string(),
  metadata: metadataSchema,
});

/**
 * A directed, typed edge. For `EFFECT_LINK` edges `rationale`/`confidence`/`origin` are set; for
 * structural edges they are `null`.
 */
export const graphEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(EDGE_KINDS),
  rationale: z.string().nullable(),
  confidence: z.number().nullable(),
  origin: z.string().nullable(),
  metadata: metadataSchema,
});

/**
 * `GET /v1/graph` querystring — a bounded subgraph for visualization. `nodeKinds`/`edgeKinds` are
 * comma-separated (invalid kinds are ignored); `limit` caps the node set (level-of-detail).
 */
export const graphQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(5000).optional(),
  nodeKinds: z.string().min(1).optional().describe('Comma-separated node kinds to include.'),
  edgeKinds: z.string().min(1).optional().describe('Comma-separated edge kinds to include.'),
});

/** `GET /v1/graph` response — a self-consistent subgraph (edges connect only returned nodes). */
export const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

export type GraphQueryString = z.infer<typeof graphQuerySchema>;
