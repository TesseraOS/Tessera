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

/**
 * LINE-SCOPED, deliberately — and this is the one design decision here worth knowing.
 *
 * The first version of this guard required the count within 24 characters of the word "tool". It
 * caught four of the five sentences it was written for and **missed** codex.mdx's "list the
 * available tools in-session — tessera should contribute 18", where the noun sits ~43 characters
 * from the number. A gate that passes while missing its own motivating case is worse than no gate,
 * so the proximity window is gone: a line that talks about tools may not carry the literal count.
 *
 * Verified against the real content tree — all five original phrasings caught, zero false positives
 * at the current counts.
 */
function offenders(pages: readonly string[], count: number, noun: string): string[] {
  const mentionsNoun = new RegExp(`\\b${noun}s?\\b`, 'i');
  const hasCount = new RegExp(`\\b${count}\\b`);
  return pages.flatMap((page) => {
    const lines = readFileSync(page, 'utf8').split('\n');
    return lines.flatMap((line, index) =>
      mentionsNoun.test(line) && hasCount.test(line)
        ? [`${relative(APP_ROOT, page).replaceAll('\\', '/')}:${index + 1}  ${line.trim()}`]
        : [],
    );
  });
}

describe('prose never hand-copies a generated count', () => {
  const pages = collectMdx(CONTENT_ROOT);

  it('finds MDX to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it('never writes the literal MCP tool count on a line about tools', () => {
    const count = mcpTools.toolCount;
    const found = offenders(pages, count, 'tool');
    expect(
      found,
      `hand-copied tool count (${count}) — use <McpToolCount /> so the number follows the server:\n${found.join('\n')}`,
    ).toEqual([]);
  });

  it('never writes the literal CLI command count on a line about commands', () => {
    const count = cliReference.commands.length;
    const found = offenders(pages, count, 'command');
    expect(
      found,
      `hand-copied CLI command count (${count}):\n${found.join('\n')}`,
    ).toEqual([]);
  });
});
