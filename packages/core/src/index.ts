/**
 * @tessera/core — shared, dependency-free domain primitives used by every package.
 *
 * (F-002) ids, typed errors, Result, config types, and an in-process typed event bus.
 */

/** Current package version (kept in sync with package.json by tooling later). */
export const VERSION = '0.0.0';

/** Returns the @tessera/core package version. */
export function coreVersion(): string {
  return VERSION;
}

export * from './id.js';
export * from './errors.js';
export * from './result.js';
export * from './config.js';
export * from './events.js';
