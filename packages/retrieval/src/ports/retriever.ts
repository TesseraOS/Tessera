import type { ProjectId, TenantId } from '@tessera/core';
import type { Candidate, RetrievalQuery, RetrieverKind } from '../domain.js';

/**
 * The common retriever interface (ARCHITECTURE §8). Each strategy — semantic, keyword, graph,
 * symbolic (and temporal in R1) — implements it, returning candidates **ordered best-first**, each
 * tagged with the retriever's `kind`, honoring `query.limit`. The fusion ranker combines several.
 *
 * **Scope (FR-52/FR-66, ADR-0033/0037):** {@link Retriever.forTenant} then {@link Retriever.forProject}
 * return views whose index (or the store they delegate to) is confined to one `(tenant, project)`, so
 * retrieval never crosses tenants or projects. The base retriever operates in
 * `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`.
 */
export interface Retriever {
  readonly kind: RetrieverKind;
  retrieve(query: RetrievalQuery): Promise<readonly Candidate[]>;
  /** A view of this retriever confined to `tenantId` (FR-52), reset to that tenant's default project. */
  forTenant(tenantId: TenantId): Retriever;
  /**
   * A view of this retriever confined to `projectId` **within the current tenant** (FR-66, ADR-0037);
   * chain after {@link Retriever.forTenant} for a full `(tenant, project)` scope.
   */
  forProject(projectId: ProjectId): Retriever;
}
