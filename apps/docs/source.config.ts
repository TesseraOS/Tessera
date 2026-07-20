import { pageSchema } from 'fumadocs-core/source/schema';
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { z } from 'zod';

/**
 * Fumadocs MDX source (ADR-0035): all prose lives in `content/docs`, versioned with the
 * code — "docs change with the feature" is the gate, not a CMS. Machine facts (OpenAPI,
 * MCP tools, CLI, env) are NOT authored here; they render from `generated/` (see
 * `scripts/generate.mjs` and the drift test).
 *
 * The frontmatter schema extends the default with `_openapi`: the generated REST
 * reference pages carry their preload manifest there, and the default pageSchema would
 * silently strip the key (breaking `openapi.preloadOpenAPIPage`).
 */
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend({
      _openapi: z.record(z.string(), z.unknown()).optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    // Defaults: remark-gfm etc. are part of the Fumadocs preset; keep stock so upgrades
    // stay cheap (plan §B — no forks).
  },
});
