import { z } from 'zod/v4';
import { auditEventSchema } from './audit.js';
import { graphEdgeSchema, graphNodeSchema } from './graph.js';
import { memorySchema } from './memory.js';
import { sourceSchema } from './sources.js';

/**
 * `GET /v1/dsr/export` response — the complete tenant bundle (NFR-13, F-047). Composed from the **same**
 * schemas the individual routes serialize, so an export can never drift from the live surface. `memories`
 * holds every version (superseded included), not just the current ones.
 */
export const dsrBundleResponseSchema = z.object({
  tenantId: z.string(),
  exportedAt: z.string().describe('ISO-8601 time the bundle was assembled.'),
  memories: z.array(memorySchema).describe('Every memory version across every lineage.'),
  graph: z.object({ nodes: z.array(graphNodeSchema), edges: z.array(graphEdgeSchema) }),
  sources: z.array(sourceSchema),
  audit: z.array(auditEventSchema).describe("The tenant's complete audit trail."),
});

/**
 * `POST /v1/dsr/delete` response — what the erasure removed. The audit trail is retained by design
 * (ADR-0049): it is the compliance record of the erasure and holds no content.
 */
export const dsrDeleteResponseSchema = z.object({
  tenantId: z.string(),
  deletedAt: z.string(),
  memories: z.number().int().nonnegative().describe('Memory lineages deleted (all versions).'),
  graph: z.object({
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
  }),
  sources: z.number().int().nonnegative(),
});
