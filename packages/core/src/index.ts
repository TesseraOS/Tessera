/**
 * @tessera/core — shared domain primitives.
 *
 * Placeholder established by F-001 (monorepo & toolchain scaffold) to prove the build,
 * typecheck, lint, and test gates end-to-end. F-002 fleshes this out with stable ids,
 * typed error classes, config types, and the in-process domain event bus.
 */

/** Current package version (kept in sync with package.json by tooling later). */
export const VERSION = '0.0.0';

/** Returns the Tessera core package version. */
export function coreVersion(): string {
  return VERSION;
}
