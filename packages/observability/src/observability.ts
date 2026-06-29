import { createLogger, silentLogger, type Logger, type LoggerConfig } from './logger.js';
import { createInstruments, type Instruments } from './metrics.js';

/** The observability surface passed around the app: a structured logger + the metric instruments. */
export interface Observability {
  readonly logger: Logger;
  readonly instruments: Instruments;
}

export interface ObservabilityConfig {
  readonly logger?: LoggerConfig;
}

/** Build the {@link Observability} bundle (logger + instruments) for a process. */
export function createObservability(config: ObservabilityConfig = {}): Observability {
  return { logger: createLogger(config.logger ?? {}), instruments: createInstruments() };
}

/** A quiet observability for tests/no-op contexts (silent logger + global, possibly no-op, instruments). */
export const silentObservability: Observability = {
  logger: silentLogger,
  instruments: createInstruments(),
};
