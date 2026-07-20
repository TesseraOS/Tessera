import { source } from '@/lib/source';
import { siteConfig } from '@/lib/site';

/**
 * llms.txt — the agent-readable site index (ADR-0036): what this site is, every page
 * with its description, and where the richer machine formats live. The page list renders
 * from the same source the human site renders from, so it cannot drift.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const pages = source
    .getPages()
    .filter((page) => !page.url.startsWith('/docs/reference/api/'))
    .map((page) => `- [${page.data.title}](${siteConfig.siteUrl}${page.url}): ${page.data.description ?? ''}`);

  const body = `# ${siteConfig.title}

> ${siteConfig.tagline}. This site documents Tessera: quickstart, concepts, guides,
> per-agent MCP setup, generated references, and deployment. Reference pages are
> generated from the running system and drift-checked in CI.

## Machine formats

- Full documentation text: ${siteConfig.siteUrl}/llms-full.txt
- REST API: the OpenAPI document is served by a running deployment at GET /v1/openapi.json
  (the /docs/reference/api pages render from the same document)
- MCP tools, CLI commands, agent configs, env vars: generated JSON artifacts live in the
  repository under apps/docs/generated/

## Pages

${pages.join('\n')}

## Related surfaces

- Marketing: ${siteConfig.marketingUrl}
- Dashboard: ${siteConfig.appUrl}
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
