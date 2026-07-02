import type { ContextPackage } from './domain.js';

/**
 * A cache for compiled packages (FR-33), keyed by the deterministic compilation key
 * ({@link import('./key.js').computeCompilationKey}). Injected into the compiler; when present, an
 * identical compile is served verbatim (true reproducibility). The in-memory adapter is the local
 * default; a store-backed cache can implement the same port for a shared/persistent cache.
 */
export interface CompilationCache {
  get(key: string): Promise<ContextPackage | undefined>;
  set(key: string, pkg: ContextPackage): Promise<void>;
}

/** Default capacity of the in-memory cache. */
const DEFAULT_MAX_ENTRIES = 128;

export interface InMemoryCacheOptions {
  /** Maximum entries retained before least-recently-used eviction (default {@link DEFAULT_MAX_ENTRIES}). */
  readonly maxEntries?: number;
}

/**
 * An in-memory **LRU** {@link CompilationCache}. Reads and writes bump recency; once capacity is
 * exceeded the least-recently-used entries are evicted. Suitable for a single process; swap in a
 * store-backed implementation of the same port for cross-process sharing.
 */
export function createInMemoryCompilationCache(
  options: InMemoryCacheOptions = {},
): CompilationCache {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const entries = new Map<string, ContextPackage>();

  return {
    get(key) {
      const hit = entries.get(key);
      if (hit !== undefined) {
        entries.delete(key); // re-insert to mark as most-recently-used
        entries.set(key, hit);
      }
      return Promise.resolve(hit);
    },
    set(key, pkg) {
      entries.delete(key);
      entries.set(key, pkg);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return Promise.resolve();
    },
  };
}
