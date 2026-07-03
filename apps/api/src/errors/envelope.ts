import type { ErrorCode } from '@tessera/core';

/**
 * The single error shape every failing response carries (NFR-6). `code` is the stable
 * machine-readable {@link ErrorCode}; `message` is human-readable and **safe to show a client**
 * (never a stack trace or internal detail); `details` is optional, structured, non-sensitive
 * context (e.g. validation issues).
 */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: unknown;
  };
}

/** HTTP status for each domain {@link ErrorCode}. */
export function statusForCode(code: ErrorCode): number {
  switch (code) {
    case 'VALIDATION':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'RATE_LIMITED':
      return 429;
    case 'INTERNAL':
      return 500;
  }
}

/** The {@link ErrorCode} that best matches an HTTP status (for framework-originated errors). */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 400 && status < 500 ? 'VALIDATION' : 'INTERNAL';
  }
}

/** Build an {@link ErrorEnvelope}, omitting `details` when absent (exactOptionalPropertyTypes-safe). */
export function envelope(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
