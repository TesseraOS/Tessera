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
  /** The current (non-superseded) memories. */
  current(): readonly StoredMemory[];
  /** Every version ever captured, in creation order. */
  allVersions(): readonly StoredMemory[];
}

/**
 * A faithful in-memory {@link MemoryCaptureService}: `edit` appends a superseding version and never
 * mutates prior content (the FR-12 invariant the real `@tessera/memory` service enforces), so it
 * exercises the extraction sink's idempotency the same way the real service would.
 */
export function createFakeMemoryService(): FakeMemoryService {
  const versions: StoredMemory[] = [];
  let seq = 0;

  const currentVersions = (): StoredMemory[] => versions.filter((memory) => memory.current);

  return {
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
      versions.push(memory);
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
      versions.push(next);
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
      return [...versions];
    },
  };
}
