import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { ZodFastify } from '../app-types.js';

/**
 * Request-id / correlation (NFR-2, backend rule "correlation ids"). Every request carries a stable
 * id: an inbound `x-request-id` is honored when it is well-formed, otherwise one is generated. The id
 * is bound into Fastify's per-request logger (label `requestId`) and echoed back on the response.
 * The composition root additionally annotates the active OTel span with it (traces).
 */

/** The header carrying the correlation id, inbound and outbound. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Log field Fastify binds the request id under (kept explicit for downstream log correlation). */
export const REQUEST_ID_LOG_LABEL = 'requestId';

/**
 * A conservative id shape: word chars, dot and hyphen, 1–128 long. Rejecting anything else stops a
 * hostile client from injecting CR/LF (header/log injection) or an unbounded value via the header.
 */
const VALID_REQUEST_ID = /^[\w.-]{1,128}$/;

/** First value of a possibly-multi-valued header. */
function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Return the inbound id if it is well-formed, else `undefined`. */
export function sanitizeRequestId(raw: string | string[] | undefined): string | undefined {
  const value = firstHeader(raw)?.trim();
  return value !== undefined && VALID_REQUEST_ID.test(value) ? value : undefined;
}

/** Generate a fresh, prefixed correlation id. */
export function generateRequestId(): string {
  return `req_${randomUUID()}`;
}

/**
 * Fastify `genReqId`: honor a sanitized inbound `x-request-id`, else generate one. Used with
 * `requestIdHeader: false` so Fastify does not pick up the raw (unsanitized) header itself.
 */
export function requestIdFrom(req: IncomingMessage): string {
  return sanitizeRequestId(req.headers[REQUEST_ID_HEADER]) ?? generateRequestId();
}

/** Echo the resolved request id on every response so clients can correlate. */
export function registerRequestId(app: ZodFastify): void {
  app.addHook('onRequest', (request, reply, done) => {
    reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });
}
