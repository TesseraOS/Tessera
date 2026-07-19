import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { Memory, MemoryService } from '@tessera/memory';
import type { CorpusIndexer } from './corpus-indexer.js';

/**
 * The corpus/index ref for a memory lineage (distinct from ingested-document refs). `/`-delimited so it
 * is a portable blob key — a `:` would become an NTFS alternate-data-stream on Windows (broken `list()`).
 */
function memoryRef(lineageId: string): string {
  return `memory/${lineageId}`;
}

/** The text indexed for a memory: its title + body (so keyword + semantic both match it). */
function memoryText(memory: Memory): string {
  return `${memory.title}\n${memory.body}`;
}

/**
 * A {@link MemoryService} decorator that **indexes captured/edited memories** into the retrieval corpus
 * + indices (F-039), so a just-captured memory is immediately findable via `search`/`compile` — closing
 * the loop the 2026-07-04 live check flagged. `capture`/`edit` delegate then index under
 * `memory:<lineageId>` (an `edit` re-indexes the same ref with the superseding body); reads pass through.
 * `forTenant` rebinds both the inner service and the index tenant (ADR-0033).
 */
export function createIndexingMemoryService(
  inner: MemoryService,
  indexer: CorpusIndexer,
  tenantId: TenantId = DEFAULT_TENANT_ID,
  projectId: ProjectId = DEFAULT_PROJECT_ID,
): MemoryService {
  async function indexMemory(memory: Memory): Promise<void> {
    await indexer.indexDocument({
      ref: memoryRef(memory.lineageId),
      text: memoryText(memory),
      kind: 'memory',
      timestamp: memory.createdAt,
      metadata: { lineageId: memory.lineageId, kind: memory.kind, title: memory.title },
      tenantId,
      projectId,
    });
  }

  return {
    async capture(input) {
      const memory = await inner.capture(input);
      await indexMemory(memory);
      return memory;
    },
    async edit(lineageId, patch) {
      const memory = await inner.edit(lineageId, patch);
      await indexMemory(memory);
      return memory;
    },
    getCurrent(lineageId) {
      return inner.getCurrent(lineageId);
    },
    history(lineageId) {
      return inner.history(lineageId);
    },
    list(filter) {
      return inner.list(filter);
    },
    count(filter) {
      return inner.count(filter);
    },
    exportAll() {
      return inner.exportAll();
    },
    async prune(policy, options) {
      // De-index whatever the pass expires (retention FR-15 / DSR): compare the current lineage set
      // before/after so an erased memory is also removed from the retrieval corpus (no remanence).
      const before = new Set((await inner.list()).map((memory) => memory.lineageId));
      const result = await inner.prune(policy, options);
      const after = new Set((await inner.list()).map((memory) => memory.lineageId));
      for (const lineageId of before) {
        if (!after.has(lineageId)) {
          await indexer.removeDocument({ ref: memoryRef(lineageId), tenantId, projectId });
        }
      }
      return result;
    },
    async deleteLineage(lineageId) {
      await inner.deleteLineage(lineageId);
      await indexer.removeDocument({ ref: memoryRef(lineageId), tenantId });
    },
    forTenant(next) {
      return createIndexingMemoryService(inner.forTenant(next), indexer, next, DEFAULT_PROJECT_ID);
    },
    forProject(next) {
      return createIndexingMemoryService(inner.forProject(next), indexer, tenantId, next);
    },
  };
}
