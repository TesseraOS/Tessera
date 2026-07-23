import type { ChangeEvent, IngestionScope, SourceDescriptor, SourceEntry } from '../domain.js';

/**
 * Diff a source's current entries against the last-known manifest snapshot to produce the minimal
 * set of change events (FR-8): `added` (new path), `modified` (hash differs), `removed` (gone).
 * Unchanged entries produce nothing — this is what prevents a full re-index on a small change.
 *
 * Every emitted event is stamped with the source's `scope` (F-071), so the worker indexes into the
 * `(tenant, project)` that owns the source rather than the default tenant.
 */
export function diffEntries(
  source: SourceDescriptor,
  scope: IngestionScope,
  current: readonly SourceEntry[],
  prior: ReadonlyMap<string, string>,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  const seen = new Set<string>();

  for (const entry of current) {
    seen.add(entry.path);
    const priorHash = prior.get(entry.path);
    if (priorHash === undefined) {
      events.push({
        source,
        scope,
        path: entry.path,
        changeKind: 'added',
        contentHash: entry.contentHash,
      });
    } else if (priorHash !== entry.contentHash) {
      events.push({
        source,
        scope,
        path: entry.path,
        changeKind: 'modified',
        contentHash: entry.contentHash,
      });
    }
  }

  for (const path of prior.keys()) {
    if (!seen.has(path)) {
      events.push({ source, scope, path, changeKind: 'removed' });
    }
  }

  return events;
}
