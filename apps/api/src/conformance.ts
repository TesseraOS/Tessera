/**
 * Shared conformance suites for the ports `@tessera/api` defines, published on the
 * `@tessera/api/conformance` subpath so adapters that live in **other packages** can run the very
 * same contract their in-memory reference implementation runs.
 *
 * A separate entry, not the package root, for the same reason `@tessera/mcp/http` is: these modules
 * import `vitest`, and the root entry is loaded by the shipped runtime.
 *
 * Before this existed, an out-of-package adapter had no way to reach these suites and hand-copied a
 * subset instead — `packages/config/src/audit/sqlite-audit-log.test.ts` says so in its own comments
 * ("this assertion duplicates a case in the shared audit-log.conformance suite"). Duplicated contract
 * cases drift; that is the whole argument for a conformance suite in the first place.
 */
export {
  runAuditLogConformance,
  type AuditLogFactory,
  type AuditLogHarness,
} from './audit/audit-log.conformance.js';
export {
  runProjectStoreConformance,
  type ProjectStoreFactory,
} from './projects/store.conformance.js';
