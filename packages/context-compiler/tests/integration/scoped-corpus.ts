import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TENANT_ID,
  type ProjectId,
  type TenantId,
} from '@tessera/core';
import type { FragmentSource, SourceFragment } from '../../src/ports/fragment-source';

interface Scope {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
}

const DEFAULT_SCOPE: Scope = { tenantId: DEFAULT_TENANT_ID, projectId: DEFAULT_PROJECT_ID };

/**
 * An in-memory {@link FragmentSource} that is **scoped the way the real one is** (ADR-0067): the
 * fragments live under one `(tenant, project)`, and a view bound to any other scope resolves nothing.
 *
 * Shared by every compiler test double so they cannot drift from `createBlobFragmentSource`. A double
 * that ignored the scope — `forTenant: () => this` — would make `compiler.forTenant(...)` look
 * correct in tests while proving nothing about the corpus, which is the exact guarantee F-075 adds.
 */
export function scopedFragmentSource(
  fragments: ReadonlyMap<string, SourceFragment>,
  home: Scope = DEFAULT_SCOPE,
  view: Scope = DEFAULT_SCOPE,
): FragmentSource {
  const inScope = view.tenantId === home.tenantId && view.projectId === home.projectId;
  return {
    get: (ref) => Promise.resolve(inScope ? fragments.get(ref) : undefined),
    forTenant: (tenantId) =>
      scopedFragmentSource(fragments, home, { tenantId, projectId: DEFAULT_PROJECT_ID }),
    forProject: (projectId) =>
      scopedFragmentSource(fragments, home, { tenantId: view.tenantId, projectId }),
  };
}

/** {@link scopedFragmentSource} over a single `(ref → text)` pair, for the one-fragment tests. */
export function singleFragmentSource(ref: string, text: string, kind = 'code'): FragmentSource {
  return scopedFragmentSource(new Map([[ref, { ref, text, kind }]]));
}
