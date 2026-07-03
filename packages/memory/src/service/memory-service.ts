import { NotFoundError, ValidationError, newId, type TenantId } from '@tessera/core';
import type { z } from 'zod';
import type { Memory, MemoryLineageId, MemoryMetadata } from '../domain.js';
import type { MemoryListFilter, MemoryStore } from '../ports/memory-store.js';
import {
  captureMemorySchema,
  editMemorySchema,
  type CaptureMemoryInput,
  type EditMemoryInput,
} from '../validation.js';

/** Parse with a domain schema, raising a typed {@link ValidationError} on failure. */
function parseOrThrow<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  message: string,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(message, { details: { issues: result.error.issues } });
  }
  return result.data as z.output<TSchema>;
}

/** Build a clean {@link MemoryMetadata} that omits absent fields (exactOptionalPropertyTypes-safe). */
function toMetadata(parsed: {
  source?: string | undefined;
  author?: string | undefined;
  links?: readonly string[] | undefined;
  tags?: readonly string[] | undefined;
}): MemoryMetadata {
  const metadata: { -readonly [K in keyof MemoryMetadata]?: MemoryMetadata[K] } = {};
  if (parsed.source !== undefined) metadata.source = parsed.source;
  if (parsed.author !== undefined) metadata.author = parsed.author;
  if (parsed.links !== undefined) metadata.links = parsed.links;
  if (parsed.tags !== undefined) metadata.tags = parsed.tags;
  return metadata;
}

/** The memory subsystem's domain service — the surface REST (F-011) and MCP (F-012) expose (FR-13). */
export interface MemoryService {
  /** Capture a new memory (version 1 of a new lineage). */
  capture(input: CaptureMemoryInput): Promise<Memory>;
  /** Edit a memory by appending a new superseding version; the prior version is never mutated. */
  edit(lineageId: MemoryLineageId, patch: EditMemoryInput): Promise<Memory>;
  /** The current version of a lineage. */
  getCurrent(lineageId: MemoryLineageId): Promise<Memory | undefined>;
  /** Every version of a lineage, oldest first. */
  history(lineageId: MemoryLineageId): Promise<readonly Memory[]>;
  /** Current memories, optionally filtered. */
  list(filter?: MemoryListFilter): Promise<readonly Memory[]>;
  /**
   * A view of this service confined to `tenantId` (FR-52, ADR-0033) — every operation runs against
   * that tenant's rows. The base service operates in {@link DEFAULT_TENANT_ID}.
   */
  forTenant(tenantId: TenantId): MemoryService;
}

/** Create a {@link MemoryService} backed by a {@link MemoryStore}. */
export function createMemoryService(store: MemoryStore): MemoryService {
  return {
    async capture(input) {
      const parsed = parseOrThrow(captureMemorySchema, input, 'invalid memory');
      const memory: Memory = {
        id: newId<'Memory'>(),
        lineageId: newId<'MemoryLineage'>(),
        kind: parsed.kind,
        title: parsed.title,
        body: parsed.body,
        scope: parsed.scope,
        confidence: parsed.confidence,
        metadata: toMetadata(parsed.metadata),
        version: 1,
        supersedes: null,
        supersededBy: null,
        createdAt: new Date().toISOString(),
      };
      await store.add(memory);
      return memory;
    },

    async edit(lineageId, patch) {
      const parsed = parseOrThrow(editMemorySchema, patch, 'invalid memory edit');
      const current = await store.getCurrent(lineageId);
      if (current === undefined) {
        throw new NotFoundError('memory lineage not found', { details: { lineageId } });
      }
      const next: Memory = {
        id: newId<'Memory'>(),
        lineageId: current.lineageId,
        // Kind is immutable across a lineage — a decision stays a decision.
        kind: current.kind,
        title: parsed.title ?? current.title,
        body: parsed.body ?? current.body,
        scope: parsed.scope ?? current.scope,
        confidence: parsed.confidence ?? current.confidence,
        metadata: parsed.metadata !== undefined ? toMetadata(parsed.metadata) : current.metadata,
        version: current.version + 1,
        supersedes: current.id,
        supersededBy: null,
        createdAt: new Date().toISOString(),
      };
      await store.supersede(current.id, next);
      return next;
    },

    getCurrent(lineageId) {
      return store.getCurrent(lineageId);
    },

    history(lineageId) {
      return store.listVersions(lineageId);
    },

    list(filter) {
      return store.listCurrent(filter);
    },

    forTenant(tenantId) {
      return createMemoryService(store.forTenant(tenantId));
    },
  };
}
