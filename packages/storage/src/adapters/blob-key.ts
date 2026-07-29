import { ValidationError } from '@tessera/core';

/**
 * Validate and normalize a blob key into its `/`-delimited segments.
 *
 * **Shared by every {@link import('../ports/blob.js').BlobStore} adapter on purpose** (F-056,
 * ADR-0059 §5). The filesystem adapter needs this because a `..` segment escapes the blob root; the
 * S3 adapter needs it because a key is user-influenced and the two surfaces must agree on what is
 * legal. If each adapter carried its own check, one of them would eventually be laxer — and "which
 * keys are accepted" would silently depend on the deployment profile.
 *
 * **A backslash is rejected outright (F-075).** This function's promise is that the key space is the
 * same everywhere, and splitting on `/` alone did not deliver it: `path.win32.join` treats `\` as a
 * separator and normalizes `..` across it, so `a\..\..\..\other` arrives here as ONE innocent
 * segment and lands outside the directory the caller named — while the same key on POSIX, and on S3,
 * is an ordinary opaque name. The result was a platform-dependent key space, and the moment a
 * caller-supplied string could reach a key (F-075's `GET /v1/fragments/:ref`, the first such path in
 * the product) that became a cross-tenant read on Windows. Rejecting `\` for every adapter on every
 * OS is the fix, because it restores the property this function exists to provide rather than
 * patching the one route that noticed.
 */
export function blobKeySegments(key: string): readonly string[] {
  if (key.includes('\\')) {
    throw new ValidationError('blob key must not contain a backslash', { details: { key } });
  }
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
