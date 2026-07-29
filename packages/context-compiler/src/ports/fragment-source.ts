import type { ProjectId, TenantId } from '@tessera/core';

/** Content resolved for a retrieval `ref` — the unit the compiler assembles. */
export interface SourceFragment {
  readonly ref: string;
  readonly text: string;
  /** Content kind, e.g. `'code'`, `'markdown'`, `'memory'`. */
  readonly kind: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Resolves retrieval refs to their content — the corpus seam between retrieval and the compiler. In
 * production this is backed by the ingestion document/blob store; tests provide an in-memory source.
 * A ref with no content resolves to `undefined` and is dropped (and traced) by the compiler.
 *
 * **Scoped, like every other domain port** (ADR-0033/0037, and ADR-0067 for this one). `get` never
 * takes a scope: a source is *bound* to one, so the only ref it can resolve is one inside that scope.
 * That is what lets `ContextCompiler.forTenant` rebind the corpus beside the retriever and the graph
 * — a compiler view whose halves disagree about whose data they read is unrepresentable — and what
 * makes a by-ref read endpoint safe at all (refs are `sha256(sourceId:path)`, derivable, not secret).
 *
 * The members are **required, not optional**: an optional scope with a silent default is precisely
 * the failure mode being removed here (ADR-0057's rule), and required members make the compiler
 * enumerate every implementation exactly once.
 */
export interface FragmentSource {
  get(ref: string): Promise<SourceFragment | undefined>;
  /** A view confined to `tenantId`; the project scope resets to its default, mirroring the stores. */
  forTenant(tenantId: TenantId): FragmentSource;
  /** A view confined to `projectId` within the current tenant. */
  forProject(projectId: ProjectId): FragmentSource;
}
