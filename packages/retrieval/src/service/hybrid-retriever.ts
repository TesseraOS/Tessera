import { z } from 'zod';
import { ValidationError, type TenantId } from '@tessera/core';
import type { FusedCandidate, RetrievalQuery } from '../domain.js';
import type { Retriever } from '../ports/retriever.js';
import { fuse, type FusionOptions, type RetrieverResult } from '../fusion/fuse.js';

const querySchema = z.object({
  text: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

/** The hybrid retrieval service — the surface REST (F-011) and MCP (F-012) expose for search. */
export interface HybridRetriever {
  /** Run every configured retriever and fuse the results into one ranked set (FR-26). */
  search(query: RetrievalQuery): Promise<readonly FusedCandidate[]>;
  /**
   * A view of the hybrid retriever confined to `tenantId` (FR-52, ADR-0033) — every child retriever
   * is scoped to the tenant, so fused results never cross tenants. Base = {@link DEFAULT_TENANT_ID}.
   */
  forTenant(tenantId: TenantId): HybridRetriever;
}

/**
 * Compose retrievers (semantic/keyword/graph/symbolic) into one hybrid retriever. `search` validates
 * the query, runs the retrievers **in parallel**, and fuses their results with the configured
 * weights into a single ranked candidate set with per-candidate signal attribution.
 */
export function createHybridRetriever(
  retrievers: readonly Retriever[],
  options: FusionOptions = {},
): HybridRetriever {
  return {
    async search(query) {
      const parsed = querySchema.safeParse(query);
      if (!parsed.success) {
        throw new ValidationError('invalid retrieval query', {
          details: { issues: parsed.error.issues },
        });
      }
      const normalized: RetrievalQuery =
        parsed.data.limit === undefined
          ? { text: parsed.data.text }
          : { text: parsed.data.text, limit: parsed.data.limit };

      const results: RetrieverResult[] = await Promise.all(
        retrievers.map(async (retriever): Promise<RetrieverResult> => ({
          signal: retriever.kind,
          candidates: await retriever.retrieve(normalized),
        })),
      );
      return fuse(results, options);
    },

    forTenant(tenantId) {
      return createHybridRetriever(
        retrievers.map((retriever) => retriever.forTenant(tenantId)),
        options,
      );
    },
  };
}
