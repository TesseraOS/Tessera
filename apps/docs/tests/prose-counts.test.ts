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
 * `<McpToolCount />` and `<CliCommandCount />` (both registered globally in `mdx-components.tsx`)
 * exist so prose never carries the number. This asserts nobody re-inlines it — and a banned literal
 * must always have a sanctioned alternative, or the rule is a trap rather than a gate.
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
 * PARAGRAPH-SCOPED, and the scope is the one design decision here worth knowing.
 *
 * v1 required the count within 24 characters of the word "tool". It caught four of the five
 * sentences it was written for and **missed** codex.mdx's "list the available tools in-session —
 * tessera should contribute 18", where the noun sits ~43 characters away. A gate that passes while
 * missing its own motivating case is worse than no gate.
 *
 * v2 dropped the window and scoped to the line — 5/5, but a number and its noun on *different*
 * lines still evade it, and that is not theoretical: this prose wraps at ~85 characters and the
 * codex.mdx line was 83. One reflow and the miss returns.
 *
 * v3 (here) scopes to the blank-line-delimited paragraph, which closes the wrap hole. Measured
 * across the whole content tree: zero false positives at the current counts, and the only added
 * exposure at other counts is a handful of numbered-list markers — a cost paid only if a count
 * ever falls into single digits.
 *
 * Reported location is the line the count sits on, so the message still points at the exact text.
 */
function offenders(pages: readonly string[], count: number, noun: string): string[] {
  const mentionsNoun = new RegExp(`\\b${noun}s?\\b`, 'i');
  const hasCount = new RegExp(`\\b${count}\\b`);

  return pages.flatMap((page) => {
    const lines = readFileSync(page, 'utf8').split('\n');
    const label = relative(APP_ROOT, page).replaceAll('\\', '/');
    const found: string[] = [];

    // Walk blank-line-delimited paragraphs, keeping each line's absolute index for reporting.
    let start = 0;
    while (start < lines.length) {
      if ((lines[start] ?? '').trim() === '') {
        start += 1;
        continue;
      }
      let end = start;
      while (end < lines.length && (lines[end] ?? '').trim() !== '') end += 1;

      const block = lines.slice(start, end);
      if (block.some((line) => mentionsNoun.test(line))) {
        block.forEach((line, offset) => {
          if (hasCount.test(line)) found.push(`${label}:${start + offset + 1}  ${line.trim()}`);
        });
      }
      start = end;
    }
    return found;
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

  it('never writes the literal CLI command count in a paragraph about commands', () => {
    const count = cliReference.commands.length;
    const found = offenders(pages, count, 'command');
    expect(
      found,
      `hand-copied CLI command count (${count}) — use <CliCommandCount /> so the number follows the CLI:\n${found.join('\n')}`,
    ).toEqual([]);
  });

  it('still catches the exact phrasings that shipped false (the F-054 regression set)', () => {
    // The five real sentences, replayed at the count they were written against. v1 of this guard
    // passed on fixed content while missing the third of these — so the regression set is pinned
    // here rather than left to a one-off manual check.
    const ORIGINALS = [
      '3. Verify: `/mcp` should list **tessera** with 18 tools; ask Claude to call',
      '  approve the **tessera** server once and the 18 tools are available in-session.',
      '3. Verify: list the available tools in-session — **tessera** should contribute 18 —',
      "1. The agent's MCP/tools listing should show a **tessera** server with 18 tools.",
      'budgeted, cited package. The full tool catalog — 18 tools with input schemas — is in',
    ];
    const mentionsNoun = /\btools?\b/i;
    const hasCount = /\b18\b/;
    for (const line of ORIGINALS) {
      expect(mentionsNoun.test(line) && hasCount.test(line), `would not catch: ${line}`).toBe(true);
    }
  });
});
