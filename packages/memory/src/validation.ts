import { z } from 'zod';
import { MEMORY_KINDS } from './domain.js';

/** Scope a memory applies to when none is given. */
export const DEFAULT_SCOPE = 'global';
/** Confidence assigned to a manual capture when none is given (human-asserted). */
export const DEFAULT_CONFIDENCE = 1;
const MAX_TITLE_LENGTH = 200;

const metadataSchema = z.object({
  source: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  links: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

/** Schema for capturing a new memory (FR-13). Applies scope/confidence/metadata defaults. */
export const captureMemorySchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  body: z.string().min(1),
  scope: z.string().min(1).default(DEFAULT_SCOPE),
  confidence: z.number().min(0).max(1).default(DEFAULT_CONFIDENCE),
  metadata: metadataSchema.default({}),
});

/** Schema for editing a memory: a patch that must change at least one field. */
export const editMemorySchema = z
  .object({
    title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
    body: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    metadata: metadataSchema.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'edit must change at least one field',
  });

/** Caller-facing input for {@link captureMemorySchema} (pre-defaults). */
export type CaptureMemoryInput = z.input<typeof captureMemorySchema>;
/** Parsed capture input (post-defaults). */
export type ParsedCaptureMemory = z.output<typeof captureMemorySchema>;
/** Caller-facing input for {@link editMemorySchema}. */
export type EditMemoryInput = z.input<typeof editMemorySchema>;
/** Parsed edit patch. */
export type ParsedEditMemory = z.output<typeof editMemorySchema>;
