/**
 * Binary object store port. The local default is the filesystem; an S3-compatible adapter
 * implements the same contract for cloud (ADR-0003). Keys are opaque, `/`-delimited paths.
 */
export interface BlobStore {
  /** Store bytes at `key`, overwriting any existing object. */
  put(key: string, data: Uint8Array): Promise<void>;
  /** Read bytes at `key`, or `undefined` if absent. */
  get(key: string): Promise<Uint8Array | undefined>;
  /** Delete `key` (no error if absent). */
  delete(key: string): Promise<void>;
  /** Whether an object exists at `key`. */
  exists(key: string): Promise<boolean>;
  /** List keys, optionally restricted to those starting with `prefix`. */
  list(prefix?: string): Promise<readonly string[]>;
}
