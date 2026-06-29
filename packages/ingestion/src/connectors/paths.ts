import { join } from 'node:path';
import { ValidationError } from '@tessera/core';

/**
 * Resolve a source-relative, `/`-delimited key to an absolute path under `rootAbs`, rejecting
 * `.`/`..` segments so a connector can never read outside its configured root (path-traversal
 * defense, shared by the filesystem and git connectors).
 */
export function relativeKeyToAbsolute(rootAbs: string, key: string): string {
  const segments = key.split('/').filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new ValidationError('ingestion path must not contain "." or ".." segments', {
      details: { key },
    });
  }
  if (segments.length === 0) {
    throw new ValidationError('ingestion path must not be empty', { details: { key } });
  }
  return join(rootAbs, ...segments);
}
