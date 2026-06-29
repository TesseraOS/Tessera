import type { RawDocument, SourceEntry } from '../domain.js';

/**
 * A source connector — the plugin contract for ingesting from a source (FR-7). First-party
 * filesystem and git connectors implement it; third-party connectors add new sources without
 * core changes, using this same stable contract (ARCHITECTURE §12).
 *
 * Split into a cheap **list** (current entries + content hashes, for diffing) and a **resolve**
 * (full content for one path), so a scan only reads the bytes of changed files downstream.
 */
export interface Connector {
  /** Connector kind, e.g. `'filesystem'` or `'git'`. */
  readonly kind: string;
  /** List the source's current ingestible entries with their content hashes. */
  list(): Promise<readonly SourceEntry[]>;
  /** Resolve full raw content for a source-relative path, or `undefined` if it no longer exists. */
  resolve(path: string): Promise<RawDocument | undefined>;
}
