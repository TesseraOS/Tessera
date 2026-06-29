import { z } from 'zod/v4';
import { RETRIEVER_KINDS } from '@tessera/retrieval';

/** The stable error codes carried by the {@link ErrorEnvelope} (mirrors `@tessera/core` `ErrorCode`). */
export const errorCodeSchema = z.enum([
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTERNAL',
]);

/** OpenAPI/JSON-Schema description of the consistent error envelope (NFR-6). */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/** Retrieval signal kinds — shared by search + compile provenance. */
export const retrieverKindSchema = z.enum(RETRIEVER_KINDS);

/** Free-form, non-sensitive, JSON-safe metadata bag. */
export const metadataSchema = z.record(z.string(), z.unknown());
