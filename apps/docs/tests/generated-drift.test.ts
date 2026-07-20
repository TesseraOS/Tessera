import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generate } from '../scripts/generate.mjs';

/**
 * THE DRIFT GATE (ADR-0054 §4): the committed `generated/` artifacts must be byte-identical
 * to a fresh run of the pipeline against the current sources of truth (SDK openapi.json,
 * CLI COMMANDS/MCP_CLIENTS, the real MCP server's tools/list, .env.example). If this fails,
 * a source changed without the docs data following it:
 *
 *   pnpm --filter @tessera/docs generate
 *
 * and commit the result. Never edit `generated/` by hand.
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('generated reference data is current', () => {
  it(
    'matches a fresh regeneration byte-for-byte',
    { timeout: 120_000 }, // boots the real MCP server over stdio
    async () => {
      const artifacts = (await generate()) as Record<string, string>;
      expect(Object.keys(artifacts).length).toBeGreaterThan(0);
      for (const [name, expected] of Object.entries(artifacts)) {
        const committed = readFileSync(join(APP_ROOT, name), 'utf8');
        expect(
          committed,
          `${name} is stale — run \`pnpm --filter @tessera/docs generate\` and commit`,
        ).toBe(expected);
      }

      // Orphan check for the generated REST tree: a page for an endpoint that no longer
      // exists must fail here rather than keep documenting a ghost. meta.json/index.mdx
      // in the api folder are hand-authored chrome and exempt.
      const apiRoot = join(APP_ROOT, 'content', 'docs', 'reference', 'api');
      const committedPages = listFiles(apiRoot)
        .map((file) => relative(APP_ROOT, file).replaceAll('\\', '/'))
        .filter((path) => !path.endsWith('/meta.json') && !path.endsWith('/index.mdx'));
      const generated = new Set(Object.keys(artifacts));
      const orphans = committedPages.filter((path) => !generated.has(path));
      expect(
        orphans,
        `orphaned generated pages (endpoint removed?) — delete them or regenerate:\n${orphans.join('\n')}`,
      ).toEqual([]);
    },
  );
});

function listFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}
