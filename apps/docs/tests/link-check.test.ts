import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import cliReference from '../generated/cli-reference.json' with { type: 'json' };
import mcpTools from '../generated/mcp-tools.json' with { type: 'json' };

/**
 * LINK-CHECK (F-053 acceptance): every internal link in the MDX content resolves to a
 * real page — and every anchor to a real heading. Page URLs are derived from the content
 * tree with fumadocs' slug rules; heading anchors are derived from the target's MDX
 * headings (github-slugger rules), plus the component-generated anchors on the reference
 * pages (CLI command names, MCP tool names — from the same generated artifacts the
 * components render).
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

/** content/docs/a/index.mdx → /docs/a · content/docs/a/b.mdx → /docs/a/b */
function urlOf(file: string): string {
  const rel = relative(CONTENT_ROOT, file).replaceAll('\\', '/').replace(/\.mdx$/, '');
  const slug = rel === 'index' ? '' : rel.endsWith('/index') ? rel.slice(0, -'/index'.length) : rel;
  return slug === '' ? '/docs' : `/docs/${slug}`;
}

/** github-slugger, minimally: lowercase, strip punctuation, spaces → hyphens. */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

const files = collectMdx(CONTENT_ROOT);
const pages = new Map<string, { file: string; anchors: Set<string> }>();

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const anchors = new Set<string>();
  for (const match of content.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    anchors.add(slugify(match[1]));
  }
  pages.set(urlOf(file), { file, anchors });
}

// Component-generated anchors (rendered from the same generated data as the pages).
for (const command of cliReference.commands) pages.get('/docs/reference/cli')?.anchors.add(command.name);
for (const tool of mcpTools.tools) pages.get('/docs/reference/mcp-tools')?.anchors.add(tool.name);

/** Non-MDX routes that internal links may target. */
const STATIC_ROUTES = new Set(['/', '/llms.txt', '/llms-full.txt']);

interface FoundLink {
  source: string;
  href: string;
}

const links: FoundLink[] = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const source = relative(APP_ROOT, file).replaceAll('\\', '/');
  // Markdown links + JSX href attributes, internal only.
  for (const match of content.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    links.push({ source, href: match[1] });
  }
  for (const match of content.matchAll(/href="(\/[^"]*)"/g)) {
    links.push({ source, href: match[1] });
  }
}

describe('internal links resolve', () => {
  it('found a meaningful number of links to check', () => {
    expect(links.length).toBeGreaterThan(50);
  });

  it('every internal link targets an existing page', () => {
    const broken = links.filter(({ href }) => {
      const path = href.split('#')[0];
      return !pages.has(path) && !STATIC_ROUTES.has(path);
    });
    expect(
      broken.map((link) => `${link.source} → ${link.href}`),
      'broken internal links',
    ).toEqual([]);
  });

  it('every anchored link targets an existing heading', () => {
    const broken = links.filter(({ href }) => {
      const [path, anchor] = href.split('#');
      if (anchor === undefined || anchor === '') return false;
      const target = pages.get(path);
      if (target === undefined) return false; // caught by the page check above
      return !target.anchors.has(anchor);
    });
    expect(
      broken.map((link) => `${link.source} → ${link.href}`),
      'broken heading anchors',
    ).toEqual([]);
  });
});
