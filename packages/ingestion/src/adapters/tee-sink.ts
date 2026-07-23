import type { ProjectId, TenantId } from '@tessera/core';
import type { DocumentRef, DocumentSink } from '../ports/sink.js';

/**
 * A {@link DocumentSink} that fans every operation out to several sinks in order — e.g. a persistence
 * sink plus the {@link import('./memory-extraction-sink.js').createMemoryExtractionSink} extraction
 * sink. Operations run sequentially so ordering (and any thrown error) is deterministic.
 *
 * **Scope forwards to EVERY member (F-071).** `forTenant`/`forProject` map over the members, so a
 * scoped write reaches each one in that scope. This is the exact seam a "second parameter" design
 * could silently drop — with required scoped views, a member that was not re-scoped would not
 * type-check, which is why the port uses views (ADR-0057).
 */
export function teeSink(...sinks: readonly DocumentSink[]): DocumentSink {
  return {
    async upsert(document) {
      for (const sink of sinks) await sink.upsert(document);
    },
    async remove(ref: DocumentRef) {
      for (const sink of sinks) await sink.remove(ref);
    },
    forTenant(tenantId: TenantId) {
      return teeSink(...sinks.map((sink) => sink.forTenant(tenantId)));
    },
    forProject(projectId: ProjectId) {
      return teeSink(...sinks.map((sink) => sink.forProject(projectId)));
    },
  };
}
