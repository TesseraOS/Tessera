import type { TenantId } from '@tessera/core';
import type { Candidate, RetrievalQuery, RetrieverKind } from '../domain.js';

/**
 * The common retriever interface (ARCHITECTURE §8). Each strategy — semantic, keyword, graph,
 * symbolic (and temporal in R1) — implements it, returning candidates **ordered best-first**, each
 * tagged with the retriever's `kind`, honoring `query.limit`. The fusion ranker combines several.
 *
 * **Tenancy (FR-52, ADR-0033):** {@link Retriever.forTenant} returns a view whose index (or the
 * store it delegates to) is confined to one tenant, so retrieval never crosses tenants. The base
 * retriever operates in {@link DEFAULT_TENANT_ID}.
 */
export interface Retriever {
  readonly kind: RetrieverKind;
  retrieve(query: RetrievalQuery): Promise<readonly Candidate[]>;
  /** A view of this retriever confined to `tenantId` (FR-52). */
  forTenant(tenantId: TenantId): Retriever;
}
