import { z } from 'zod/v4';
import { retrieverKindSchema } from './common.js';

/** How much excerpt to return per hit (F-061). */
export const snippetRequestSchema = z.object({
  maxChars: z
    .number()
    .int()
    .positive()
    .max(2000)
    .optional()
    .describe('Ceiling on the excerpt length (default 240).'),
});

/**
 * Opt-in per-hit extras (F-061).
 *
 * Every hit always carries `ref`, `score`, `signals` and `label` — a hit without a label is a
 * 64-char hash, which is not an answer at any price. Everything here is **depth**: worth real tokens
 * to a UI rendering a detail view, worth nothing to a caller that only wants ranked refs to compile.
 * Measured on a 10-result answer: `kind` +35, `node` +135, `snippet` ~+200 tokens (NFR-4 holds the
 * whole answer to a budget every caller pays on every call).
 */
export const searchIncludeSchema = z.object({
  kind: z
    .boolean()
    .optional()
    .describe('Classify each hit as `file`, `memory`, or `symbol` (+35).'),
  node: z
    .boolean()
    .optional()
    .describe('Attach the graph node to pass to `GET /v1/effects`, when the hit has one (+135).'),
  snippet: snippetRequestSchema.optional().describe('Attach a query-relevant excerpt (~+200).'),
});

/** `POST /v1/search` request body. */
export const searchBodySchema = z.object({
  query: z.string().min(1).describe('Natural-language or symbol query.'),
  limit: z.number().int().positive().max(100).optional().describe('Max candidates to return.'),
  include: searchIncludeSchema
    .optional()
    .describe('Extras to attach per hit. Ask only for what you will use — each costs tokens.'),
});

/** How one retrieval signal contributed to a fused candidate (per-candidate attribution, FR-26). */
export const signalContributionSchema = z.object({
  signal: retrieverKindSchema,
  rank: z.number().int(),
  score: z.number(),
  weight: z.number(),
  contribution: z.number(),
});

/**
 * A matched span within a snippet, as `[start, end)` character offsets into `snippet.text`.
 *
 * **Offsets rather than marked-up HTML, deliberately.** The excerpt is ingested repository content —
 * i.e. attacker-influenceable — so returning pre-highlighted HTML would hand anyone who can land a
 * file in a scanned repo the classic search-snippet XSS. A client slices the plain string and
 * renders its own highlight elements: there is no markup to inject and no sanitizer to get wrong.
 */
export const snippetMatchSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

/** A query-relevant excerpt of a hit, present only when the request asked for one. */
export const snippetSchema = z.object({
  text: z.string(),
  matches: z.array(snippetMatchSchema).describe('Spans of `text` that matched a query term.'),
  truncatedStart: z.boolean().describe('`text` starts mid-document.'),
  truncatedEnd: z.boolean().describe('`text` stops before the end of the document.'),
});

/** The knowledge-graph node a hit corresponds to, when it has one. */
export const candidateNodeSchema = z.object({
  kind: z.string(),
  key: z.string(),
});

/** One item in the fused, ranked result set. */
export const fusedCandidateSchema = z.object({
  ref: z.string(),
  score: z.number(),
  signals: z.array(signalContributionSchema),
  label: z
    .string()
    .optional()
    .describe('Human-readable title — a source path, a memory title, or a symbol name.'),
  kind: z.string().optional().describe('What this is: `file`, `memory`, or `symbol`.'),
  snippet: snippetSchema.optional(),
  node: candidateNodeSchema
    .optional()
    .describe(
      'The graph node this hit is, when it has one — pass it to `GET /v1/effects` to see what a change here would affect. Absent for items with no node (e.g. a memory).',
    ),
});

/** `POST /v1/search` response. */
export const searchResponseSchema = z.object({
  results: z.array(fusedCandidateSchema),
});

export type SearchBody = z.infer<typeof searchBodySchema>;
