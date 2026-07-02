import { createHash } from 'node:crypto';

/**
 * A canonical fingerprint of the compiler configuration that affects output — folded into the
 * compilation key so a change in any output-affecting knob yields a different key (FR-33).
 *
 * NOTE: whenever a new compiler option changes the produced package, add it here so the cache never
 * returns a stale package for a changed configuration.
 */
export interface CompilerFingerprint {
  readonly rankStrategy: string;
  readonly compressionStrategy: string;
  readonly dedupThreshold?: number;
  readonly expandDepth?: number;
}

/** The request fields (already normalized to their effective values) that identify a compilation. */
export interface NormalizedRequest {
  readonly task: string;
  readonly budget: number;
  /** The **effective** retrieval limit (after the compiler's default is applied). */
  readonly retrievalLimit: number;
  /** Filter kinds (order-independent), or `undefined` for no filter. */
  readonly kinds?: readonly string[];
}

/**
 * A deterministic key identifying a compilation from its normalized request + config fingerprint
 * (FR-33). Same inputs → same key; any output-affecting difference → a different key. Order-independent
 * for filter kinds. Used as the {@link import('./cache.js').CompilationCache} key.
 */
export function computeCompilationKey(
  request: NormalizedRequest,
  fingerprint: CompilerFingerprint,
): string {
  const canonical = JSON.stringify({
    task: request.task,
    budget: request.budget,
    retrievalLimit: request.retrievalLimit,
    kinds: request.kinds === undefined ? null : [...request.kinds].sort(),
    fingerprint: {
      rank: fingerprint.rankStrategy,
      compression: fingerprint.compressionStrategy,
      dedupThreshold: fingerprint.dedupThreshold ?? null,
      expandDepth: fingerprint.expandDepth ?? null,
    },
  });
  return createHash('sha256').update(canonical).digest('hex');
}
