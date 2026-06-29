import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

/**
 * A Fastify instance wired to the Zod type provider — route schemas are Zod, and handlers get
 * fully typed `request.body`/`query`/`params`. Route-group registration functions take this type.
 */
export type ZodFastify = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;
