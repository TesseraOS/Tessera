import { InternalError, NotFoundError } from '@tessera/core';
import type { SourceId, SourceRecord, SourceService } from '@tessera/ingestion';
import type { ZodFastify } from '../../app-types.js';
import { requirePermission, tenantOf } from '../../auth/index.js';
import { projectOf } from '../../projects/selection.js';
import type { ApiServices } from '../../services.js';
import {
  registerSourceBodySchema,
  removeSourceResponseSchema,
  scanAcceptedResponseSchema,
  scanStatusResponseSchema,
  sourceIdParamSchema,
  sourceListResponseSchema,
  sourceSchema,
  type RegisterSourceBody,
  type SourceIdParam,
} from '../../schemas/sources.js';

/** The source service, or a clean error when the runtime did not wire one (e.g. doc generation). */
function requireSources(services: ApiServices): SourceService {
  if (services.sources === undefined) {
    throw new InternalError('source management is not configured for this deployment');
  }
  return services.sources;
}

/** Project a stored source to the wire shape — drop `tenantId` (off the wire) + copy the config bag. */
function toWire(record: SourceRecord): {
  id: string;
  kind: string;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
} {
  return {
    id: record.id,
    kind: record.kind,
    label: record.label,
    config: { ...record.config },
    createdAt: record.createdAt,
  };
}

/**
 * `/v1/sources` — runtime source management (F-038; FR-62): register + scan filesystem/git repositories
 * through the ingestion pipeline, tenant-scoped via `forTenant` (ADR-0033). Reads require `sources:read`,
 * mutations (register/remove/scan) require `sources:manage`; each is audited (E-020). This is the REST
 * half of the ADR-0036 agent-first parity contract — MCP `add_source`/`list_sources`/`scan_source` wrap
 * the same service.
 */
export function registerSourceRoutes(app: ZodFastify, services: ApiServices): void {
  app.get(
    '/sources',
    {
      preHandler: requirePermission('sources:read'),
      schema: {
        tags: ['sources'],
        summary: 'List the registered sources.',
        response: { 200: sourceListResponseSchema },
      },
      config: { audit: 'source.read' },
    },
    async (request) => {
      const sources = await requireSources(services)
        .forTenant(tenantOf(request))
        .forProject(projectOf(request))
        .list();
      return { sources: sources.map(toWire) };
    },
  );

  app.post<{ Body: RegisterSourceBody }>(
    '/sources',
    {
      preHandler: requirePermission('sources:manage'),
      schema: {
        tags: ['sources'],
        summary: 'Register a source (filesystem or git) for ingestion.',
        body: registerSourceBodySchema,
        response: { 201: sourceSchema },
      },
      config: { audit: 'source.manage' },
    },
    async (request, reply) => {
      const { kind, label, config } = request.body;
      const source = await requireSources(services)
        .forTenant(tenantOf(request))
        .forProject(projectOf(request))
        .register({ kind, config, ...(label !== undefined ? { label } : {}) });
      return reply.status(201).send(toWire(source));
    },
  );

  app.get<{ Params: SourceIdParam }>(
    '/sources/:id',
    {
      preHandler: requirePermission('sources:read'),
      schema: {
        tags: ['sources'],
        summary: 'Get a registered source.',
        params: sourceIdParamSchema,
        response: { 200: sourceSchema },
      },
      config: { audit: 'source.read' },
    },
    async (request) => {
      const id = request.params.id as SourceId;
      const source = await requireSources(services)
        .forTenant(tenantOf(request))
        .forProject(projectOf(request))
        .get(id);
      if (source === undefined) {
        throw new NotFoundError('source not found', { details: { id } });
      }
      return toWire(source);
    },
  );

  app.delete<{ Params: SourceIdParam }>(
    '/sources/:id',
    {
      preHandler: requirePermission('sources:manage'),
      schema: {
        tags: ['sources'],
        summary: 'Remove a registered source.',
        params: sourceIdParamSchema,
        response: { 200: removeSourceResponseSchema },
      },
      config: { audit: 'source.manage' },
    },
    async (request) => {
      const id = request.params.id as SourceId;
      await requireSources(services)
        .forTenant(tenantOf(request))
        .forProject(projectOf(request))
        .remove(id);
      return { id };
    },
  );

  app.post<{ Params: SourceIdParam }>(
    '/sources/:id/scan',
    {
      preHandler: requirePermission('sources:manage'),
      schema: {
        tags: ['sources'],
        summary:
          'Start a scan (incremental + idempotent). Returns 202; poll GET or watch /v1/events.',
        description:
          'Accepts the scan and returns immediately — it runs in the background. Follow it with ' +
          'GET /v1/sources/:id/scan or the source.scan.progress / .completed / .failed events. ' +
          'Returns 409 if a scan of this source is already running.',
        params: sourceIdParamSchema,
        response: { 202: scanAcceptedResponseSchema },
      },
      config: { audit: 'source.manage' },
    },
    async (request, reply) => {
      const id = request.params.id as SourceId;
      const scoped = requireSources(services)
        .forTenant(tenantOf(request))
        .forProject(projectOf(request));

      // `startScan`, not `scan` (F-081). This used to await the coordinator AND the queue drain, so
      // the client held a request open for the whole ingest — CPU-bound embedding included. The
      // audited action still fires here and still records the truth: a scan was *requested*.
      // A 409 (already running) surfaces from ConflictError via the error handler.
      const status = await scoped.startScan(id);
      const source = await scoped.get(id);
      if (source === undefined) {
        throw new NotFoundError('source not found', { details: { id } });
      }

      return reply.status(202).send({
        source: toWire(source),
        state: status.state,
        ...(status.progress !== undefined ? { progress: status.progress } : {}),
      });
    },
  );

  app.get<{ Params: SourceIdParam }>(
    '/sources/:id/scan',
    {
      preHandler: requirePermission('sources:read'),
      schema: {
        tags: ['sources'],
        summary: "A source's most recent scan status.",
        params: sourceIdParamSchema,
        response: { 200: scanStatusResponseSchema },
      },
      config: { audit: 'source.read' },
    },
    async (request) => {
      const id = request.params.id as SourceId;
      const status = await requireSources(services)
        .forTenant(tenantOf(request))
        .forProject(projectOf(request))
        .scanStatus(id);
      if (status === undefined) {
        throw new NotFoundError('source not found', { details: { id } });
      }
      return status;
    },
  );
}
