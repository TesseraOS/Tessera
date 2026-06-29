import type { SourceId } from '../domain.js';
import type { IngestionManifest } from '../ports/manifest.js';

/**
 * In-memory {@link IngestionManifest} — the local default for tests and single-run ingestion. A
 * relational-backed adapter adds cross-process durability later (the manifest is just a content-hash
 * index per source).
 */
export function createInMemoryManifest(): IngestionManifest {
  const bySource = new Map<SourceId, Map<string, string>>();

  function forSource(sourceId: SourceId): Map<string, string> {
    let entries = bySource.get(sourceId);
    if (entries === undefined) {
      entries = new Map();
      bySource.set(sourceId, entries);
    }
    return entries;
  }

  return {
    snapshot(sourceId) {
      return Promise.resolve(new Map(forSource(sourceId)));
    },
    get(sourceId, path) {
      return Promise.resolve(forSource(sourceId).get(path));
    },
    set(sourceId, path, contentHash) {
      forSource(sourceId).set(path, contentHash);
      return Promise.resolve();
    },
    delete(sourceId, path) {
      forSource(sourceId).delete(path);
      return Promise.resolve();
    },
  };
}
