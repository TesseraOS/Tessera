import { NotFoundError, ValidationError, newId, type TenantId } from '@tessera/core';
import type { z } from 'zod';
import type { Memory, MemoryLineageId, MemoryMetadata } from '../domain.js';
import type { MemoryListFilter, MemoryStore } from '../ports/memory-store.js';
import {
  pruneMemories,
  type MemoryRetentionPolicy,
  type PruneOptions,
  type PruneResult,
} from './retention.js';
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
   * Every stored version across every lineage (all versions, superseded included) — the complete
   * tenant-scoped record backing DSR export (NFR-13, F-047).
   */
  exportAll(): Promise<readonly Memory[]>;
  /**
   * How many memories this tenant currently holds (superseded versions excluded), optionally
   * filtered. Backs the workspace summary (`GET /v1/stats`, F-060) — counted at the store, never by
   * listing.
   */
  count(filter?: MemoryListFilter): Promise<number>;
  /**
   * Apply a retention policy (FR-15): expire aged lineages and compact superseded versions. Deletion
   * only — never mutates content or the current version of a kept lineage. Returns what was removed.
   */
  prune(policy: MemoryRetentionPolicy, options?: PruneOptions): Promise<PruneResult>;
  /** Delete every version of a lineage (retention expiry / DSR erasure). Idempotent. */
  deleteLineage(lineageId: MemoryLineageId): Promise<void>;
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

    count(filter) {
      return store.countCurrent(filter);
    },

    exportAll() {
      return store.exportAll();
    },

    prune(policy, options) {
      return pruneMemories(store, policy, options);
    },

    deleteLineage(lineageId) {
      return store.deleteLineage(lineageId);
    },

    forTenant(tenantId) {
      return createMemoryService(store.forTenant(tenantId));
    },
  };
}
