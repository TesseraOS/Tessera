/** Stable, machine-readable error codes used across the domain. */
export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface TesseraErrorOptions {
  /** Stable error code (defaults to `INTERNAL`). */
  readonly code?: ErrorCode;
  /** Structured, non-sensitive context for logs/responses (never include secrets). */
  readonly details?: Readonly<Record<string, unknown>>;
  /** Underlying cause, preserved on `Error.cause`. */
  readonly cause?: unknown;
}

/** Base class for all Tessera domain errors. Subclasses set a fixed {@link ErrorCode}. */
export class TesseraError extends Error {
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(message: string, options: TesseraErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? 'INTERNAL';
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

type FixedCodeOptions = Omit<TesseraErrorOptions, 'code'>;

/** Input failed validation at a trust boundary. */
export class ValidationError extends TesseraError {
  constructor(message: string, options: FixedCodeOptions = {}) {
    super(message, { ...options, code: 'VALIDATION' });
  }
}

/** A requested resource does not exist. */
export class NotFoundError extends TesseraError {
  constructor(message: string, options: FixedCodeOptions = {}) {
    super(message, { ...options, code: 'NOT_FOUND' });
  }
}

/** The operation conflicts with current state (e.g. a uniqueness violation). */
export class ConflictError extends TesseraError {
  constructor(message: string, options: FixedCodeOptions = {}) {
    super(message, { ...options, code: 'CONFLICT' });
  }
}

/** The caller is not authenticated. */
export class UnauthorizedError extends TesseraError {
  constructor(message: string, options: FixedCodeOptions = {}) {
    super(message, { ...options, code: 'UNAUTHORIZED' });
  }
}

/** The caller is authenticated but not permitted. */
export class ForbiddenError extends TesseraError {
  constructor(message: string, options: FixedCodeOptions = {}) {
    super(message, { ...options, code: 'FORBIDDEN' });
  }
}

/** The caller exceeded a rate limit or quota (→ HTTP 429). */
export class RateLimitedError extends TesseraError {
  constructor(message: string, options: FixedCodeOptions = {}) {
    super(message, { ...options, code: 'RATE_LIMITED' });
  }
}

/** An unexpected internal failure. */
export class InternalError extends TesseraError {
  constructor(message: string, options: FixedCodeOptions = {}) {
    super(message, { ...options, code: 'INTERNAL' });
  }
}
