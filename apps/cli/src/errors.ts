/**
 * A user-facing CLI failure with a chosen exit code and an optional actionable hint. Commands throw
 * this for expected error conditions (bad flags, missing config, a clone that failed); the router
 * prints `error: <message>` (+ the hint) to stderr and exits with {@link CliError.exitCode}. Unexpected
 * errors (bugs) surface with a stack via the router's catch-all, so the two are never confused.
 */
export class CliError extends Error {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(
    message: string,
    options: { exitCode?: number; hint?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'CliError';
    this.exitCode = options.exitCode ?? 1;
    if (options.hint !== undefined) this.hint = options.hint;
  }
}

/** Type guard so the router can format {@link CliError} distinctly from unexpected throws. */
export function isCliError(value: unknown): value is CliError {
  return value instanceof CliError;
}
