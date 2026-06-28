import type { TesseraError } from './errors.js';

/**
 * A discriminated result: either a success `value` or a failure `error`.
 * Prefer this over throwing for expected domain failures so callers handle them explicitly.
 */
export type Result<T, E = TesseraError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Construct a success result. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Construct a failure result. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Narrowing guard for the success case. */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/** Narrowing guard for the failure case. */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}
