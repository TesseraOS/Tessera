import { NotFoundError } from '@tessera/core';
import type { MemoryLineageId } from '@tessera/memory';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import type { ApiEventBus } from '../../events.js';
import type { ApiServices } from '../../services.js';
import {
  captureBodySchema,
  editBodySchema,
  lineageParamSchema,
  memoryHistoryResponseSchema,
  memoryListQuerySchema,
  memoryListResponseSchema,
  memorySchema,
  type CaptureBody,
  type EditBody,
  type LineageParam,
  type MemoryListQuery,
} from '../../schemas/memory.js';

/**
 * `/v1/memory` — capture/list/read/edit/history over the versioned memory subsystem (F-007). Edits
 * append a superseding version (the prior is never mutated); reads/edits of an unknown lineage
 * surface `NOT_FOUND` (404).
 */
export function registerMemoryRoutes(
  app: ZodFastify,
  services: ApiServices,
  events: ApiEventBus,
): void {
  app.post<{ Body: CaptureBody }>(
    '/memory',
    {
      preHandler: requirePermission('memory:write'),
      schema: {
        tags: ['memory'],
        summary: 'Capture a new memory.',
        body: captureBodySchema,
        response: { 201: memorySchema },
      },
      config: { audit: 'memory.write' },
    },
    async (request, reply) => {
      const tenantId = tenantOf(request);
      const memory = await services.memory.forTenant(tenantId).capture(request.body);
      // Live update (FR-38): notify SSE subscribers of the new memory (non-sensitive summary only).
      // Attributed to the capturing tenant so only their stream receives it (ADR-0050) — the title
      // alone is enough to leak what another org is working on.
      await events.emit('memory.captured', {
        tenantId,
        lineageId: memory.lineageId,
        kind: memory.kind,
        title: memory.title,
      });
      return reply.status(201).send(memory);
    },
  );

  app.get<{ Querystring: MemoryListQuery }>(
    '/memory',
    {
      preHandler: requirePermission('memory:read'),
      schema: {
        tags: ['memory'],
        summary: 'List the current memories.',
        querystring: memoryListQuerySchema,
        response: { 200: memoryListResponseSchema },
      },
      config: { audit: 'memory.read' },
    },
    async (request) => {
      const { kind, scope } = request.query;
      const filter = {
        ...(kind !== undefined ? { kind } : {}),
        ...(scope !== undefined ? { scope } : {}),
      };
      const memories = await services.memory.forTenant(tenantOf(request)).list(filter);
      return { memories };
    },
  );

  app.get<{ Params: LineageParam }>(
    '/memory/:lineageId',
    {
      preHandler: requirePermission('memory:read'),
      schema: {
        tags: ['memory'],
        summary: 'Get the current version of a memory lineage.',
        params: lineageParamSchema,
        response: { 200: memorySchema },
      },
      config: { audit: 'memory.read' },
    },
    async (request) => {
      const lineageId = request.params.lineageId as MemoryLineageId;
      const memory = await services.memory.forTenant(tenantOf(request)).getCurrent(lineageId);
      if (memory === undefined) {
        throw new NotFoundError('memory lineage not found', { details: { lineageId } });
      }
      return memory;
    },
  );

  app.patch<{ Params: LineageParam; Body: EditBody }>(
    '/memory/:lineageId',
    {
      preHandler: requirePermission('memory:write'),
      schema: {
        tags: ['memory'],
        summary: 'Edit a memory (appends a superseding version).',
        params: lineageParamSchema,
        body: editBodySchema,
        response: { 200: memorySchema },
      },
      config: { audit: 'memory.write' },
    },
    (request) => {
      const lineageId = request.params.lineageId as MemoryLineageId;
      return services.memory.forTenant(tenantOf(request)).edit(lineageId, request.body);
    },
  );

  app.get<{ Params: LineageParam }>(
    '/memory/:lineageId/history',
    {
      preHandler: requirePermission('memory:read'),
      schema: {
        tags: ['memory'],
        summary: 'Every version of a memory lineage, oldest first.',
        params: lineageParamSchema,
        response: { 200: memoryHistoryResponseSchema },
      },
      config: { audit: 'memory.read' },
    },
    async (request) => {
      const lineageId = request.params.lineageId as MemoryLineageId;
      const versions = await services.memory.forTenant(tenantOf(request)).history(lineageId);
      return { versions };
    },
  );
}
