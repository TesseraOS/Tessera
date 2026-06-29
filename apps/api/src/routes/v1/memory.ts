import { NotFoundError } from '@tessera/core';
import type { MemoryLineageId } from '@tessera/memory';
import type { ZodFastify } from '../../app-types.js';
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
export function registerMemoryRoutes(app: ZodFastify, services: ApiServices): void {
  app.post<{ Body: CaptureBody }>(
    '/memory',
    {
      schema: {
        tags: ['memory'],
        summary: 'Capture a new memory.',
        body: captureBodySchema,
        response: { 201: memorySchema },
      },
    },
    async (request, reply) => {
      const memory = await services.memory.capture(request.body);
      return reply.status(201).send(memory);
    },
  );

  app.get<{ Querystring: MemoryListQuery }>(
    '/memory',
    {
      schema: {
        tags: ['memory'],
        summary: 'List the current memories.',
        querystring: memoryListQuerySchema,
        response: { 200: memoryListResponseSchema },
      },
    },
    async (request) => {
      const { kind, scope } = request.query;
      const filter = {
        ...(kind !== undefined ? { kind } : {}),
        ...(scope !== undefined ? { scope } : {}),
      };
      const memories = await services.memory.list(filter);
      return { memories };
    },
  );

  app.get<{ Params: LineageParam }>(
    '/memory/:lineageId',
    {
      schema: {
        tags: ['memory'],
        summary: 'Get the current version of a memory lineage.',
        params: lineageParamSchema,
        response: { 200: memorySchema },
      },
    },
    async (request) => {
      const lineageId = request.params.lineageId as MemoryLineageId;
      const memory = await services.memory.getCurrent(lineageId);
      if (memory === undefined) {
        throw new NotFoundError('memory lineage not found', { details: { lineageId } });
      }
      return memory;
    },
  );

  app.patch<{ Params: LineageParam; Body: EditBody }>(
    '/memory/:lineageId',
    {
      schema: {
        tags: ['memory'],
        summary: 'Edit a memory (appends a superseding version).',
        params: lineageParamSchema,
        body: editBodySchema,
        response: { 200: memorySchema },
      },
    },
    (request) => {
      const lineageId = request.params.lineageId as MemoryLineageId;
      return services.memory.edit(lineageId, request.body);
    },
  );

  app.get<{ Params: LineageParam }>(
    '/memory/:lineageId/history',
    {
      schema: {
        tags: ['memory'],
        summary: 'Every version of a memory lineage, oldest first.',
        params: lineageParamSchema,
        response: { 200: memoryHistoryResponseSchema },
      },
    },
    async (request) => {
      const lineageId = request.params.lineageId as MemoryLineageId;
      const versions = await services.memory.history(lineageId);
      return { versions };
    },
  );
}
