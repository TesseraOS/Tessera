import { z } from 'zod/v4';
import { MEMORY_KINDS } from '@tessera/memory';

const MAX_TITLE_LENGTH = 200;

/** Provenance/linkage on a memory (FR-11). All fields optional; defaults applied by the service. */
const memoryMetadataSchema = z.object({
  source: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  links: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

/** `POST /v1/memory` body — capture a new memory (FR-13). scope/confidence/metadata default in the service. */
export const captureBodySchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  body: z.string().min(1),
  scope: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: memoryMetadataSchema.optional(),
});

/** `PATCH /v1/memory/:lineageId` body — must change at least one field (a new version is appended). */
export const editBodySchema = z
  .object({
    title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
    body: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    metadata: memoryMetadataSchema.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'edit must change at least one field',
  });

/** Path parameter shared by the single-lineage memory routes. */
export const lineageParamSchema = z.object({
  lineageId: z.string().min(1),
});

/** `GET /v1/memory` querystring — list the current memories, optionally filtered. */
export const memoryListQuerySchema = z.object({
  kind: z.enum(MEMORY_KINDS).optional(),
  scope: z.string().min(1).optional(),
});

/** One immutable memory version (FR-12). */
export const memorySchema = z.object({
  id: z.string(),
  lineageId: z.string(),
  kind: z.enum(MEMORY_KINDS),
  title: z.string(),
  body: z.string(),
  scope: z.string(),
  confidence: z.number(),
  metadata: memoryMetadataSchema,
  version: z.number().int(),
  supersedes: z.string().nullable(),
  supersededBy: z.string().nullable(),
  createdAt: z.string(),
});

/** `GET /v1/memory` response. */
export const memoryListResponseSchema = z.object({ memories: z.array(memorySchema) });

/** `GET /v1/memory/:lineageId/history` response — every version, oldest first. */
export const memoryHistoryResponseSchema = z.object({ versions: z.array(memorySchema) });

export type CaptureBody = z.infer<typeof captureBodySchema>;
export type EditBody = z.infer<typeof editBodySchema>;
export type LineageParam = z.infer<typeof lineageParamSchema>;
export type MemoryListQuery = z.infer<typeof memoryListQuerySchema>;
