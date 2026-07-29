import { z } from 'zod/v4';

/**
 * The most text one `GET /v1/fragments/:ref` will return (128 KiB of characters).
 *
 * A cap rather than an unbounded body: a corpus fragment is a whole ingested file, and a route that
 * will stream any size on request is a memory and bandwidth footgun on both ends. Over the cap the
 * response carries the leading window and says `truncated: true` — a truncated body that declares
 * itself is honest; a silently trimmed one is the trap (the `MAX_AUDIT_EXPORT_ROWS` precedent).
 */
export const MAX_FRAGMENT_TEXT_CHARS = 131_072;

/**
 * Path parameter for the by-ref read.
 *
 * **One path segment, deliberately.** `memory/<lineageId>` refs are therefore not expressible here —
 * and must not be: memory bodies are already served by the tenant-scoped `/v1/memory/:lineageId`,
 * which the dashboard already uses, so accepting `%2F` would buy a normalization hazard through the
 * dashboard's rewrite proxy for a path that already exists.
 */
export const fragmentRefParamSchema = z.object({
  /**
   * Constrained to the grammar the corpus actually issues — a `sha256` digest, or an id-shaped ref.
   * **Defence in depth, not the control**: `blobKeySegments` rejects traversal for every adapter, and
   * a scoped `FragmentSource` is what confines the read. But this is the first place in the product
   * where a caller-supplied string reaches a storage key, and "any 256 characters" was how a
   * backslash reached `path.win32.join` and escaped the tenant prefix. A parameter should accept the
   * shape it is for.
   */
  ref: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'ref must be an alphanumeric corpus reference'),
});

/**
 * `GET /v1/fragments/:ref` response — a **narrow projection**, not the stored fragment.
 *
 * `path` is lifted out of the ingestion metadata by name; the rest of that bag is deliberately not
 * echoed. It is written by ingestion and grows over time, and re-emitting it wholesale would put
 * whatever it gains next straight onto the wire unreviewed.
 */
export const fragmentResponseSchema = z.object({
  ref: z.string(),
  /** Content kind as recorded at ingestion (`code`, `markdown`, `text`, `memory`). */
  kind: z.string(),
  text: z.string(),
  /** Source-relative path, when the fragment came from a scanned file. */
  path: z.string().optional(),
  /** True when `text` is the leading {@link MAX_FRAGMENT_TEXT_CHARS} characters of a longer body. */
  truncated: z.boolean(),
});

export type FragmentRefParam = z.infer<typeof fragmentRefParamSchema>;
export type FragmentResponse = z.infer<typeof fragmentResponseSchema>;
