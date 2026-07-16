import type { Memory } from '@tessera/memory';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ZodFastify } from '../../app-types.js';
import type { AuditLog } from '../../audit/index.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { buildDsrBundle, purgeTenant } from '../../dsr/index.js';
import { dsrBundleResponseSchema, dsrDeleteResponseSchema } from '../../schemas/dsr.js';
import type { ApiServices } from '../../services.js';

/**
 * Project a stored {@link Memory} onto the wire shape. The domain type's arrays are `readonly`; the
 * response schema's are mutable, so `metadata`'s lists are copied (same projection the `/v1/memory`
 * routes serialize).
 */
function toWireMemory(memory: Memory): {
  id: string;
  lineageId: string;
  kind: Memory['kind'];
  title: string;
  body: string;
  scope: string;
  confidence: number;
  metadata: { source?: string; author?: string; links?: string[]; tags?: string[] };
  version: number;
  supersedes: string | null;
  supersededBy: string | null;
  createdAt: string;
} {
  const { metadata } = memory;
  return {
    id: memory.id,
    lineageId: memory.lineageId,
    kind: memory.kind,
    title: memory.title,
    body: memory.body,
    scope: memory.scope,
    confidence: memory.confidence,
    metadata: {
      ...(metadata.source !== undefined ? { source: metadata.source } : {}),
      ...(metadata.author !== undefined ? { author: metadata.author } : {}),
      ...(metadata.links !== undefined ? { links: [...metadata.links] } : {}),
      ...(metadata.tags !== undefined ? { tags: [...metadata.tags] } : {}),
    },
    version: memory.version,
    supersedes: memory.supersedes,
    supersededBy: memory.supersededBy,
    createdAt: memory.createdAt,
  };
}

/**
 * `/v1/dsr` — data-subject rights (NFR-13; F-047, ADR-0049). Both routes require `admin:manage`, act on
 * **the caller's own tenant only** (`tenantOf(request)` — never a tenant id off the wire, so an admin can
 * never export or erase someone else's data), and are audited (`dsr.export` / `dsr.delete`).
 *
 * `DELETE` erases the data plane (memories incl. their retrieval-index entries, graph, sources) but
 * **retains the audit trail** — it is the compliance record of the erasure and holds no content
 * (ADR-0049). The `dsr.delete` event for the call itself is recorded by the audit hook.
 */
export function registerDsrRoutes(app: ZodFastify, services: ApiServices, audit: AuditLog): void {
  const scoped = app.withTypeProvider<ZodTypeProvider>();

  scoped.get(
    '/dsr/export',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['dsr'],
        summary: 'Export everything held for the calling tenant (memories, graph, sources, audit).',
        response: { 200: dsrBundleResponseSchema },
      },
      config: { audit: 'dsr.export' },
    },
    async (request) => {
      const bundle = await buildDsrBundle(services, audit, tenantOf(request));
      return {
        tenantId: bundle.tenantId,
        exportedAt: bundle.exportedAt,
        memories: bundle.memories.map(toWireMemory),
        graph: { nodes: [...bundle.graph.nodes], edges: [...bundle.graph.edges] },
        sources: bundle.sources.map((source) => ({ ...source, config: { ...source.config } })),
        audit: bundle.audit.map((event) => ({ ...event })),
      };
    },
  );

  scoped.post(
    '/dsr/delete',
    {
      preHandler: requirePermission('admin:manage'),
      schema: {
        tags: ['dsr'],
        summary: "Erase the calling tenant's data plane (the audit trail is retained).",
        response: { 200: dsrDeleteResponseSchema },
      },
      config: { audit: 'dsr.delete' },
    },
    async (request) => {
      const tenantId = tenantOf(request);
      const summary = await purgeTenant(services, tenantId);
      return { tenantId, deletedAt: new Date().toISOString(), ...summary };
    },
  );
}
