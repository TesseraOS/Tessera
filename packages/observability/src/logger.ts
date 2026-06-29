import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

/**
 * Keys whose values are **always redacted** wherever they appear — secrets must never be logged
 * (NFR-7). Includes a guard against logging raw ingested content (`content`/`rawContent`): pass
 * metadata (ids, counts, refs), never the content itself.
 */
const DEFAULT_REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'apiKey',
  '*.apiKey',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'req.headers.authorization',
  'headers.cookie',
  'req.headers.cookie',
  'dsn',
  '*.dsn',
  'connectionString',
  '*.connectionString',
  'content',
  '*.content',
  'rawContent',
  '*.rawContent',
];

export interface LoggerConfig {
  /** Minimum level (`debug`/`info`/`warn`/`error`/`silent`). Default `info`. */
  readonly level?: string;
  /** Logger name binding. */
  readonly name?: string;
  /** Extra redaction paths, added to the secure defaults. */
  readonly redact?: readonly string[];
  /** Destination stream (default stdout). Tests pass a capture stream. */
  readonly destination?: DestinationStream;
  /** Write to stderr instead of stdout — required when stdout is a protocol channel (MCP stdio). */
  readonly stderr?: boolean;
}

/** Create a structured Pino logger with secret/content redaction baked in (NFR-7). */
export function createLogger(config: LoggerConfig = {}): Logger {
  const options: LoggerOptions = {
    level: config.level ?? 'info',
    redact: { paths: [...DEFAULT_REDACT_PATHS, ...(config.redact ?? [])], censor: '[redacted]' },
    ...(config.name !== undefined ? { name: config.name } : {}),
  };
  const destination = config.destination ?? (config.stderr === true ? process.stderr : undefined);
  return destination === undefined ? pino(options) : pino(options, destination);
}

/** A logger that emits nothing — for tests and no-op contexts. */
export const silentLogger: Logger = pino({ level: 'silent' });
