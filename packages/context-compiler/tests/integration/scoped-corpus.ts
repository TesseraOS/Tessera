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

const key = (scope: Scope): string => `${scope.tenantId}/${scope.projectId}`;

/**
 * An in-memory {@link FragmentSource} scoped **the way the real one is** (ADR-0067): fragments live
 * under a `(tenant, project)`, and a view bound elsewhere resolves nothing.
 *
 * Shared by every compiler test double so they cannot drift scope-blind. A double that ignored the
 * scope — `forTenant: () => this` — would make `compiler.forTenant(...)` look correct in tests while
 * proving nothing about the corpus, which is the guarantee F-075 adds.
 *
 * `byScope` is a map so a caller can plant a **decoy** under another scope. That matters more than
 * it looks: with content under one scope only, "another tenant sees nothing" is satisfied by the
 * corpus being empty there, so the assertion passes even when the rebinding it guards is deleted.
 * A decoy under the base scope makes an unrebound view return the WRONG body instead of no body.
 */
export function scopedFragmentSource(
  byScope: ReadonlyMap<string, ReadonlyMap<string, SourceFragment>>,
  view: Scope = DEFAULT_SCOPE,
): FragmentSource {
  return {
    get: (ref) => Promise.resolve(byScope.get(key(view))?.get(ref)),
    forTenant: (tenantId) =>
      scopedFragmentSource(byScope, { tenantId, projectId: DEFAULT_PROJECT_ID }),
    forProject: (projectId) =>
      scopedFragmentSource(byScope, { tenantId: view.tenantId, projectId }),
  };
}

/** {@link scopedFragmentSource} over fragments living in one scope (the default unless given). */
export function singleScopeFragmentSource(
  fragments: ReadonlyMap<string, SourceFragment>,
  home: Scope = DEFAULT_SCOPE,
): FragmentSource {
  return scopedFragmentSource(new Map([[key(home), fragments]]));
}

/** {@link singleScopeFragmentSource} over a single `(ref → text)` pair, for the one-fragment tests. */
export function singleFragmentSource(ref: string, text: string, kind = 'code'): FragmentSource {
  return singleScopeFragmentSource(new Map([[ref, { ref, text, kind }]]));
}
