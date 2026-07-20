import { readFile } from 'node:fs/promises';
import { source } from '@/lib/source';
import { siteConfig } from '@/lib/site';

/**
 * llms-full.txt — the complete documentation text in one plain response (ADR-0036), so
 * an agent can ingest the whole manual without crawling. Prose pages are emitted as
 * their raw MDX bodies (frontmatter stripped). The generated REST pages are component
 * shells over the OpenAPI document, so instead of their markup this dump points at the
 * document itself — the better machine format.
 */
export const dynamic = 'force-static';

function stripFrontmatter(raw: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(raw);
  return match ? raw.slice(match[0].length).trim() : raw.trim();
}

export async function GET(): Promise<Response> {
  const pages = source.getPages().filter((page) => !page.url.startsWith('/docs/reference/api/'));

  const sections = await Promise.all(
    pages.map(async (page) => {
      const raw =
        page.absolutePath !== undefined ? await readFile(page.absolutePath, 'utf8') : '';
      return [
        `# ${page.data.title}`,
        `URL: ${siteConfig.siteUrl}${page.url}`,
        page.data.description !== undefined ? `Description: ${page.data.description}` : undefined,
        '',
        stripFrontmatter(raw),
      ]
        .filter((line) => line !== undefined)
        .join('\n');
    }),
  );

  const body = `# ${siteConfig.title} — full text

> ${siteConfig.tagline}. Every documentation page follows, separated by "---".
> REST API detail: GET /v1/openapi.json on a running deployment (the source of the
> /docs/reference/api pages, omitted here as component markup).

---

${sections.join('\n\n---\n\n')}
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
