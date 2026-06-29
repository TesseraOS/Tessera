import type { SourceId } from '../domain.js';

/**
 * The content-hash index that makes ingestion incremental and idempotent (FR-8): it records the
 * last persisted content hash per `(source, path)`. A scan diffs the source's current entries
 * against this snapshot to emit only real changes; the worker advances it after a successful
 * persist. Ingestion ships an in-memory adapter; a relational-backed adapter adds durability later.
 */
export interface IngestionManifest {
  /** All known `path → contentHash` entries for a source. */
  snapshot(sourceId: SourceId): Promise<ReadonlyMap<string, string>>;
  get(sourceId: SourceId, path: string): Promise<string | undefined>;
  set(sourceId: SourceId, path: string, contentHash: string): Promise<void>;
  delete(sourceId: SourceId, path: string): Promise<void>;
}
