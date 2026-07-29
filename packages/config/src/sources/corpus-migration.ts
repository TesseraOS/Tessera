import type { BlobStore } from '@tessera/storage';
import { CORPUS_RESERVED_PREFIX, corpusKey, type CorpusScope } from '../fragment-source.js';

/** Where the completed migration records itself. Under the reserved prefix, so no tenant can own it. */
const MARKER_KEY = `${CORPUS_RESERVED_PREFIX}migrations/corpus-scope-keys.json`;

const encoder = new TextEncoder();

export interface CorpusMigrationResult {
  /** How many blobs were moved under a scoped key. */
  readonly moved: number;
  /** True when the marker was already present and nothing was examined. */
  readonly skipped: boolean;
}

/**
 * Move a pre-F-075 corpus — one global key space, keys equal to the bare `ref` — under its owning
 * `(tenant, project)` prefix (ADR-0067).
 *
 * **Why this is not a `Migration` in the SQL runner.** `runMigrations` executes SQL statements over a
 * `MigrationDb`; it cannot move blobs, and there is no other migration mechanism. Rather than dress a
 * blob pass up as SQL, this is its own function called from the composition root at boot — which is
 * also the only place that keeps a developer's existing `.tessera` working across a `git pull` with no
 * instructions. After the key change, an unmigrated corpus is unreadable.
 *
 * **Idempotent and safe under concurrent replicas.** Copy-then-delete, guarded by a marker written
 * only at the end: a pass interrupted halfway leaves the marker absent, so the next boot finishes it,
 * and a key another replica already moved reads back `undefined` and is skipped. Two replicas racing
 * both do safe work and write the same marker.
 *
 * **The marker is data, not a cache.** Deleting it and rebooting would re-run the pass — which the
 * already-scoped check below makes harmless, except for a corpus whose legacy keys begin with a
 * segment equal to this deployment's tenant id. Said out loud rather than trusted to nobody trying.
 */
export async function migrateCorpusToScopedKeys(
  blob: BlobStore,
  scope: CorpusScope,
): Promise<CorpusMigrationResult> {
  if (await blob.exists(MARKER_KEY)) return { moved: 0, skipped: true };

  const prefix = `${corpusKey(scope, '')}`; // `{tenant}/{project}/`
  const keys = await blob.list();
  let moved = 0;

  for (const key of keys) {
    if (key.startsWith(CORPUS_RESERVED_PREFIX)) continue;
    if (key.startsWith(prefix)) continue;

    const bytes = await blob.get(key);
    if (bytes === undefined) continue; // vanished mid-pass — another replica got there first.

    await blob.put(`${prefix}${key}`, bytes);
    await blob.delete(key);
    moved += 1;
  }

  await blob.put(
    MARKER_KEY,
    encoder.encode(
      JSON.stringify({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        moved,
        at: new Date().toISOString(),
      }),
    ),
  );

  return { moved, skipped: false };
}
