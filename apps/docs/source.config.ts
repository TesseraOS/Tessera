import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

/**
 * Fumadocs MDX source (ADR-0035): all prose lives in `content/docs`, versioned with the
 * code — "docs change with the feature" is the gate, not a CMS. Machine facts (OpenAPI,
 * MCP tools, CLI, env) are NOT authored here; they render from `generated/` (see
 * `scripts/generate.mjs` and the drift test).
 */
export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    // Defaults: remark-gfm etc. are part of the Fumadocs preset; keep stock so upgrades
    // stay cheap (plan §B — no forks).
  },
});
