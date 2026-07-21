import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import cliReference from '../generated/cli-reference.json' with { type: 'json' };
import mcpTools from '../generated/mcp-tools.json' with { type: 'json' };

/**
 * PROSE MUST NOT HAND-COPY A GENERATED COUNT (added after F-054).
 *
 * The generated artifacts and the components over them were all correct when the MCP surface
 * went 18 -> 20 tools — but five hand-written sentences across the agent guides and the
 * quickstart still told the reader to expect "18 tools", and those are exactly the VERIFY
 * steps someone follows right after connecting an agent. The drift gate could not see them
 * (they are prose, not generated), and the e2e could not either (it derives its headings from
 * the artifact).
 *
 * `<McpToolCount />` / `<CliCommandCount />`-style components exist so prose never carries the
 * number. This asserts nobody re-inlines it.
 */

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = join(APP_ROOT, 'content', 'docs');

function collectMdx(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collectMdx(full);
    return entry.endsWith('.mdx') ? [full] : [];
  });
}

describe('prose never hand-copies a generated count', () => {
  const pages = collectMdx(CONTENT_ROOT);

  it('finds MDX to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it('never writes the literal MCP tool count next to the word "tool"', () => {
    const count = mcpTools.toolCount;
    // "20 tools", "contribute 20", "with 20 tools" — the shapes the F-054 miss actually took.
    const literal = new RegExp(`\\b${count}\\b(?=[^\\n]{0,24}\\btools?\\b)|\\btools?\\b[^\\n]{0,24}\\b${count}\\b`);
    const offenders = pages
      .filter((page) => literal.test(readFileSync(page, 'utf8')))
      .map((page) => relative(APP_ROOT, page).replaceAll('\\', '/'));

    expect(
      offenders,
      `hand-copied tool count (${count}) — use <McpToolCount /> so the number follows the server:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('never writes the literal CLI command count next to the word "command"', () => {
    const count = cliReference.commands.length;
    const literal = new RegExp(
      `\\b${count}\\b(?=[^\\n]{0,24}\\bcommands?\\b)|\\bcommands?\\b[^\\n]{0,24}\\b${count}\\b`,
    );
    const offenders = pages
      .filter((page) => literal.test(readFileSync(page, 'utf8')))
      .map((page) => relative(APP_ROOT, page).replaceAll('\\', '/'));

    expect(offenders, `hand-copied CLI command count (${count}):\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });
});
