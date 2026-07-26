import { ValidationError } from '@tessera/core';

/**
 * Validate and normalize a blob key into its `/`-delimited segments.
 *
 * **Shared by every {@link import('../ports/blob.js').BlobStore} adapter on purpose** (F-056,
 * ADR-0059 §5). The filesystem adapter needs this because a `..` segment escapes the blob root; the
 * S3 adapter needs it because a key is user-influenced and the two surfaces must agree on what is
 * legal. If each adapter carried its own check, one of them would eventually be laxer — and "which
 * keys are accepted" would silently depend on the deployment profile.
 */
export function blobKeySegments(key: string): readonly string[] {
  const segments = key.split('/').filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new ValidationError('blob key must not contain "." or ".." segments', {
      details: { key },
    });
  }
  if (segments.length === 0) {
    throw new ValidationError('blob key must not be empty', { details: { key } });
  }
  return segments;
}
