import { TesseraError } from '@tessera/core';
import type { FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { codeForStatus, envelope, statusForCode, type ErrorEnvelope } from './envelope.js';

/** Message returned for any 5xx — internal detail is never leaked to the client. */
const GENERIC_INTERNAL_MESSAGE = 'internal server error';

/** The outcome of mapping an arbitrary thrown value to an HTTP response. */
export interface MappedError {
  readonly statusCode: number;
  readonly body: ErrorEnvelope;
  /** True when this is a server-side fault that should be logged at error level. */
  readonly serverFault: boolean;
}

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}

function messageOf(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

/**
 * Map any thrown value to a status + {@link ErrorEnvelope}. Pure and exhaustively unit-tested:
 * request-validation failures → 400, domain {@link TesseraError} → its code's status (5xx is
 * masked), framework 4xx are preserved, and anything else is a masked 500.
 */
export function mapError(error: unknown): MappedError {
  // 1. Request validation failures raised by the Zod type provider.
  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      statusCode: 400,
      body: envelope('VALIDATION', 'request validation failed', { issues: error.validation }),
      serverFault: false,
    };
  }

  // 2. Response serialization failures mean our output disagrees with our schema — our bug.
  if (isResponseSerializationError(error)) {
    return {
      statusCode: 500,
      body: envelope('INTERNAL', GENERIC_INTERNAL_MESSAGE),
      serverFault: true,
    };
  }

  // 3. Domain errors carry a stable, mappable code.
  if (error instanceof TesseraError) {
    const statusCode = statusForCode(error.code);
    if (statusCode >= 500) {
      return {
        statusCode,
        body: envelope('INTERNAL', GENERIC_INTERNAL_MESSAGE),
        serverFault: true,
      };
    }
    return {
      statusCode,
      body: envelope(error.code, error.message, error.details),
      serverFault: false,
    };
  }

  // 4. Framework/other errors that already declare a client (4xx) status (e.g. body-parse errors).
  const status = statusCodeOf(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      statusCode: status,
      body: envelope(codeForStatus(status), messageOf(error) ?? 'request error'),
      serverFault: false,
    };
  }

  // 5. Anything else is an unexpected internal fault — never leak its detail.
  return {
    statusCode: 500,
    body: envelope('INTERNAL', GENERIC_INTERNAL_MESSAGE),
    serverFault: true,
  };
}

/**
 * Install the consistent error envelope (NFR-6): one `setErrorHandler` mapping every failure via
 * {@link mapError}, plus a `setNotFoundHandler` so unmatched routes use the same envelope. Server
 * faults are logged; nothing internal is sent to the client.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const mapped = mapError(error);
    if (mapped.serverFault) {
      request.log.error({ err: error }, 'request failed');
    }
    return reply.status(mapped.statusCode).send(mapped.body);
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send(envelope('NOT_FOUND', `route not found: ${request.method} ${request.url}`));
  });
}
