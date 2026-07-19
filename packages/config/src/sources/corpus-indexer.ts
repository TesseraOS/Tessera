import { createHash } from 'node:crypto';
import type { Embeddings } from '@tessera/ai';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { KeywordRetriever, TemporalRetriever } from '@tessera/retrieval';
import type { BlobStore, VectorStore } from '@tessera/storage';
import type { SourceFragment } from '@tessera/context-compiler';
import { putFragment } from '../fragment-source.js';

/** A timestamp source for the temporal index: epoch ms, ISO string, or Date. */
export type IndexTimestamp = number | string | Date;

/** Input to {@link CorpusIndexer.indexDocument}. */
export interface IndexDocumentInput {
  /** The stable ref shared across the corpus + every index (e.g. a document id or `memory:<lineageId>`). */
  readonly ref: string;
  /** The text to index + embed (already normalized + redacted for ingested docs). */
  readonly text: string;
  /** Fragment kind (`code`/`markdown`/`memory`/…) carried into the corpus + provenance. */
  readonly kind: string;
  /** Recency signal (default: now). */
  readonly timestamp?: IndexTimestamp;
  /** Non-sensitive metadata stored on the corpus fragment. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Tenant to index under (default {@link DEFAULT_TENANT_ID}). */
  readonly tenantId?: TenantId;
  /** Project to index under, within the tenant (default {@link DEFAULT_PROJECT_ID}, ADR-0037). */
  readonly projectId?: ProjectId;
}

/**
 * Writes `(ref, text)` into the blob corpus + every retrieval index so it becomes findable by
 * `search`/`compile` (F-039). One scope-aware path shared by ingestion (the DocumentSink) and memory
 * capture (a MemoryService decorator), so both share a single ref space (the fusion requirement). The
 * retrieval indices are scoped by `(tenant, project)` (ADR-0033/0037); the content-addressed blob keeps
 * a single ref space (per-tenant blob keying is the separate F-075).
 */
export interface CorpusIndexer {
  indexDocument(input: IndexDocumentInput): Promise<void>;
  removeDocument(input: {
    readonly ref: string;
    readonly tenantId?: TenantId;
    readonly projectId?: ProjectId;
  }): Promise<void>;
}

export interface CorpusIndexerOptions {
  readonly blob: BlobStore;
  readonly keyword: KeywordRetriever;
  readonly temporal: TemporalRetriever;
  readonly embeddings: Embeddings;
  readonly vector: VectorStore;
}

function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Build a {@link CorpusIndexer} over the runtime's stores. Indexing a document writes a corpus fragment
 * (so the compiler can cite it) and populates the keyword (FTS5, FR-22), temporal (recency, FR-24), and
 * semantic (embed → VectorStore, FR-21) indices through their tenant-scoped views (ADR-0033). An
 * in-memory `ref → sha256(text)` cache short-circuits an unchanged `(ref, text)` so it is **never
 * re-embedded** (NFR-12) — a belt-and-suspenders over the ingestion manifest, which already prevents
 * re-processing unchanged documents upstream.
 */
export function createCorpusIndexer(options: CorpusIndexerOptions): CorpusIndexer {
  const { blob, keyword, temporal, embeddings, vector } = options;
  const indexedHash = new Map<string, string>();

  const cacheKey = (tenantId: TenantId, projectId: ProjectId, ref: string): string =>
    `${JSON.stringify([tenantId, projectId])}:${ref}`;

  return {
    async indexDocument(input) {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const projectId = input.projectId ?? DEFAULT_PROJECT_ID;
      const key = cacheKey(tenantId, projectId, input.ref);
      const hash = textHash(input.text);
      if (indexedHash.get(key) === hash) return; // unchanged → never re-embed (NFR-12)

      const fragment: SourceFragment =
        input.metadata === undefined
          ? { ref: input.ref, text: input.text, kind: input.kind }
          : { ref: input.ref, text: input.text, kind: input.kind, metadata: { ...input.metadata } };
      await putFragment(blob, fragment);

      keyword.forTenant(tenantId).forProject(projectId).index(input.ref, input.text);
      temporal
        .forTenant(tenantId)
        .forProject(projectId)
        .index(input.ref, input.timestamp ?? Date.now());

      const embedding = await embeddings.embed(input.text);
      await vector
        .forTenant(tenantId)
        .forProject(projectId)
        .upsert([{ id: input.ref, vector: embedding, model: embeddings.info.model }]);

      indexedHash.set(key, hash);
    },

    async removeDocument(input) {
      const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
      const projectId = input.projectId ?? DEFAULT_PROJECT_ID;
      await blob.delete(input.ref);
      keyword.forTenant(tenantId).forProject(projectId).remove(input.ref);
      temporal.forTenant(tenantId).forProject(projectId).remove(input.ref);
      await vector.forTenant(tenantId).forProject(projectId).delete([input.ref]);
      indexedHash.delete(cacheKey(tenantId, projectId, input.ref));
    },
  };
}
