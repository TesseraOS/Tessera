import { DEFAULT_PROJECT_ID, DEFAULT_TENANT_ID } from '@tessera/core';
import type {
  CapturedMemory,
  MemoryCaptureService,
} from '../../src/adapters/memory-extraction-sink';
import type { CandidateMemory, CandidateMemoryKind } from '../../src/extraction/candidate';

interface StoredMemory extends CapturedMemory {
  readonly lineageId: string;
  readonly kind: CandidateMemoryKind;
  readonly title: string;
  readonly body: string;
  readonly metadata: { readonly source?: string };
  version: number;
  current: boolean;
}

/** A {@link MemoryCaptureService} plus inspection helpers for assertions. */
export interface FakeMemoryService extends MemoryCaptureService {
  /** The current (non-superseded) memories in THIS view's `(tenant, project)` partition. */
  current(): readonly StoredMemory[];
  /** Every version ever captured in this partition, in creation order. */
  allVersions(): readonly StoredMemory[];
  forTenant(tenantId: string): FakeMemoryService;
  forProject(projectId: string): FakeMemoryService;
}

/**
 * A faithful in-memory {@link MemoryCaptureService}: `edit` appends a superseding version and never
 * mutates prior content (the FR-12 invariant the real `@tessera/memory` service enforces), so it
 * exercises the extraction sink's idempotency the same way the real service would.
 *
 * **Scope-partitioned (F-071).** Each `(tenant, project)` view captures into its own partition, so a
 * test can prove the extraction sink rebinds — capturing under `forTenant('acme')` must NOT reach the
 * base `(default, default)` view. The base view is `(default, default)`, so pre-scope tests are
 * unchanged.
 */
export function createFakeMemoryService(): FakeMemoryService {
  const partitions = new Map<string, StoredMemory[]>();
  let seq = 0;
  const key = (tenantId: string, projectId: string): string =>
    JSON.stringify([tenantId, projectId]);

  function viewFor(tenantId: string, projectId: string): FakeMemoryService {
    const versions = (): StoredMemory[] => {
      const existing = partitions.get(key(tenantId, projectId));
      if (existing !== undefined) return existing;
      const created: StoredMemory[] = [];
      partitions.set(key(tenantId, projectId), created);
      return created;
    };
    const currentVersions = (): StoredMemory[] => versions().filter((memory) => memory.current);

    const service: FakeMemoryService = {
      capture(input: CandidateMemory) {
        seq += 1;
        const memory: StoredMemory = {
          lineageId: `lineage-${seq}`,
          kind: input.kind,
          title: input.title,
          body: input.body,
          metadata: input.metadata?.source !== undefined ? { source: input.metadata.source } : {},
          version: 1,
          current: true,
        };
        versions().push(memory);
        return Promise.resolve(memory);
      },
      edit(lineageId, patch) {
        const currentVersion = currentVersions().find((memory) => memory.lineageId === lineageId);
        if (currentVersion === undefined) {
          return Promise.reject(new Error(`no such lineage: ${lineageId}`));
        }
        currentVersion.current = false;
        const next: StoredMemory = {
          ...currentVersion,
          body: patch.body,
          version: currentVersion.version + 1,
          current: true,
        };
        versions().push(next);
        return Promise.resolve(next);
      },
      list(filter) {
        const kind = filter?.kind;
        return Promise.resolve(
          currentVersions().filter((memory) => kind === undefined || memory.kind === kind),
        );
      },
      current: currentVersions,
      allVersions() {
        return [...versions()];
      },
      // forTenant resets the project to the tenant's default (ADR-0033), mirroring the real service.
      forTenant(nextTenant) {
        return viewFor(nextTenant, DEFAULT_PROJECT_ID);
      },
      forProject(nextProject) {
        return viewFor(tenantId, nextProject);
      },
    };
    return service;
  }

  return viewFor(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID);
}
