import { createHash } from 'node:crypto';

/**
 * Content hash (SHA-256, hex) of raw bytes. The basis for incremental, idempotent ingestion:
 * unchanged content hashes equal, so the worker skips it (FR-8). Stable across platforms.
 */
export function contentHashOf(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
