import { posix } from 'node:path';

/** Code extensions stripped so a file node key aligns with extensionless import specifiers. */
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

/** Strip a known code extension from a source-relative path (`src/a.ts` → `src/a`). */
export function stripCodeExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot <= 0) return path;
  return CODE_EXTENSIONS.has(path.slice(dot)) ? path.slice(0, dot) : path;
}

/**
 * The graph node key for a source file — the **extensionless** source-relative path, so an import like
 * `'./foo'` (which omits the extension) resolves to the same key as the file `foo.ts`. Keeping the graph
 * key extensionless is what lets import edges connect without a filesystem lookup (ADR-0041); the full
 * path is preserved on the node's label/metadata.
 */
export function fileNodeKey(sourcePath: string): string {
  return stripCodeExtension(sourcePath);
}

/**
 * Resolve a relative import `specifier` written in `fromPath` to an **extensionless, source-relative**
 * target key, or `undefined` when it cannot map to a file node: a bare/package specifier (`'react'`) or
 * one that escapes the repository root. Directory/index resolution (`'./foo'` → `foo/index`) is a
 * documented refinement.
 */
export function resolveRelativeImport(fromPath: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined; // bare / package import
  const fromDir = posix.dirname(fromPath);
  const joined = posix.normalize(posix.join(fromDir, specifier));
  if (joined === '..' || joined.startsWith('../')) return undefined; // escaped the repo root
  return stripCodeExtension(joined);
}
