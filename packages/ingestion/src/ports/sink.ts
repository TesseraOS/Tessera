import type { ProjectId, TenantId } from '@tessera/core';
import type { ProcessedDocument, SourceId } from '../domain.js';

/** Reference to a document by its source and path (used for removal). */
export interface DocumentRef {
  readonly sourceId: SourceId;
  readonly path: string;
}

/**
 * Destination for processed documents — the seam between ingestion and persistence. Ingestion
 * ships an in-memory adapter; downstream features back this with the relational/vector/blob
 * stores and the knowledge graph (F-007/F-008/F-009). Implementations must be **idempotent**:
 * upserting the same document id twice yields one record.
 *
 * **Scoped (F-071, ADR-0057).** The worker resolves the destination `(tenant, project)` from the
 * queue job and writes through `sink.forTenant(t).forProject(p)`. These are **required** members, not
 * a `upsert(document, scope)` parameter, on purpose: a required member forces every implementer to
 * answer "what does scope mean for me?", whereas a parameter is silently droppable — and this whole
 * feature exists because a scope was silently dropped. The base sink is `(default, default)`, so every
 * pre-scope caller and test is unchanged. It is the codebase's universal scoping idiom
 * (`MemoryStore`/`GraphStore`/`VectorStore`/`SourceRegistry`/…).
 */
export interface DocumentSink {
  upsert(document: ProcessedDocument): Promise<void>;
  remove(ref: DocumentRef): Promise<void>;
  /** A view bound to `tenantId` (reset to its default project) — writes never cross tenants (ADR-0033). */
  forTenant(tenantId: TenantId): DocumentSink;
  /** A view bound to `projectId` within the current tenant (ADR-0037). */
  forProject(projectId: ProjectId): DocumentSink;
}
