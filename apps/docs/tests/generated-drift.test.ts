import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
        const committed = readFileSync(join(APP_ROOT, 'generated', name), 'utf8');
        expect(
          committed,
          `generated/${name} is stale — run \`pnpm --filter @tessera/docs generate\` and commit`,
        ).toBe(expected);
      }
    },
  );
});
