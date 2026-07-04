import { NODE_KINDS } from '@tessera/knowledge-graph';
import { MEMORY_KINDS } from '@tessera/memory';
import { z } from 'zod';

/**
 * Tool input schemas as Zod **raw shapes** — the shape the MCP SDK (`registerTool`) validates and
 * converts to JSON Schema for `tools/list`. Classic Zod 3 (the SDK's expected API), so these stay
 * aligned with the domain services' own validation. Validating here satisfies FR-35's "tool inputs
 * validated"; the same services back the REST surface (F-011).
 */

export const searchShape = {
  query: z.string().min(1).describe('Natural-language or symbol query.'),
  limit: z.number().int().positive().max(100).optional().describe('Max candidates to return.'),
};

const filtersShape = z
  .object({ kinds: z.array(z.string().min(1)).optional() })
  .optional()
  .describe('Restrict fragments to these kinds.');

export const compileShape = {
  task: z.string().min(1).describe('The task context is being compiled for.'),
  budget: z.number().int().positive().describe('Max tokens the package may occupy.'),
  retrievalLimit: z.number().int().positive().max(200).optional(),
  filters: filtersShape,
};

export const explainShape = {
  task: z.string().min(1).describe('The task to explain context selection for.'),
  budget: z.number().int().positive().optional().describe('Token budget (a default applies).'),
  retrievalLimit: z.number().int().positive().max(200).optional(),
  filters: filtersShape,
};

export const effectsShape = {
  kind: z.enum(NODE_KINDS).describe('Kind of the node whose dependents to find.'),
  key: z.string().min(1).describe('Natural key of the node (e.g. a file path or symbol).'),
  maxDepth: z.number().int().positive().max(20).optional(),
};

export const captureMemoryShape = {
  kind: z.enum(MEMORY_KINDS),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  scope: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z
    .object({
      source: z.string().min(1).optional(),
      author: z.string().min(1).optional(),
      links: z.array(z.string().min(1)).optional(),
      tags: z.array(z.string().min(1)).optional(),
    })
    .optional(),
};

export const addSourceShape = {
  kind: z.string().min(1).describe('Connector kind: "filesystem" or "git".'),
  root: z.string().min(1).describe('Working-tree path to ingest.'),
  label: z.string().min(1).optional().describe('Human-readable label (defaults to the root).'),
};

/** `list_sources` takes no arguments. */
export const listSourcesShape = {};

export const scanSourceShape = {
  id: z.string().min(1).describe('The source id returned by add_source.'),
};
