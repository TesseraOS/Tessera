import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
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
): MemoryService {
  async function indexMemory(memory: Memory): Promise<void> {
    await indexer.indexDocument({
      ref: memoryRef(memory.lineageId),
      text: memoryText(memory),
      kind: 'memory',
      timestamp: memory.createdAt,
      metadata: { lineageId: memory.lineageId, kind: memory.kind, title: memory.title },
      tenantId,
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
    forTenant(next) {
      return createIndexingMemoryService(inner.forTenant(next), indexer, next);
    },
  };
}
