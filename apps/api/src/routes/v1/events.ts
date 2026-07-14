import type { ZodFastify } from '../../app-types.js';
import { API_EVENT_TYPES, sseComment, sseFrame, type ApiEventBus } from '../../events.js';
import { securityHeaders, type SecurityHeadersOptions } from '../../security/headers.js';
import { REQUEST_ID_HEADER } from '../../security/request-id.js';

/** Heartbeat interval — keeps the connection (and intermediaries) alive on quiet streams. */
const HEARTBEAT_MS = 15_000;

/**
 * `GET /v1/events` — a **Server-Sent Events** stream of live updates (FR-38): ingest progress and new
 * memories. The handler `hijack`s the reply and owns the raw socket, writing framed events. It
 * **subscribes before** the opening comment so no event is lost between connect and subscribe,
 * heartbeats on an `unref`'d timer, and tears everything down when the client disconnects.
 *
 * Authentication is not special-cased here: the route lives inside the `/v1` auth scope, so the
 * `onRequest` auth hook runs (and, under a non-none provider, 401s an unauthenticated request)
 * before this handler hijacks the reply (F-044). Because hijacking bypasses the normal reply
 * lifecycle, the security headers + the echoed request id are written into `writeHead` explicitly.
 */
export function registerEventsRoutes(
  app: ZodFastify,
  events: ApiEventBus,
  security: SecurityHeadersOptions = {},
): void {
  app.get(
    '/events',
    {
      schema: {
        tags: ['events'],
        description:
          'Server-Sent Events stream of live updates — ingest progress and new memories (FR-38).',
      },
    },
    (request, reply) => {
      // Take ownership of the raw response; Fastify will not serialize or send for us.
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        [REQUEST_ID_HEADER]: request.id,
        ...securityHeaders(security),
      });

      const unsubscribes = API_EVENT_TYPES.map((type) =>
        events.on(type, (payload) => {
          raw.write(sseFrame(type, payload));
        }),
      );

      raw.write('retry: 3000\n\n'); // client reconnection backoff hint
      raw.write(sseComment('connected'));

      const heartbeat = setInterval(() => raw.write(sseComment('ping')), HEARTBEAT_MS);
      heartbeat.unref();

      request.raw.on('close', () => {
        clearInterval(heartbeat);
        for (const unsubscribe of unsubscribes) unsubscribe();
      });
    },
  );
}
