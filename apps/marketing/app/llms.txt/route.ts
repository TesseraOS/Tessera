import { siteConfig } from '@/lib/site';

/**
 * llms.txt — agent-readable site index (ADR-0036). Marketing and docs surfaces serve this
 * so agents can consume the public story without scraping HTML.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const body = `# ${siteConfig.name}

> ${siteConfig.tagline}. Open core, deployment-agnostic (local / self-hosted / cloud).
> Tessera ingests repositories and decisions, remembers them across sessions, and compiles
> budgeted, cited context packages served to any MCP-capable agent.

## Differentiators

- Context Compiler: retrieve, rank, compress, cite — within a caller-set token budget.
- Effect-links: contract-to-dependent impact graph; agents call get_effects before editing.
- Governance: tenant isolation, RBAC, quotas, and an audit trail at the API boundary.

## MCP tools

compile_context, search, get_effects, capture_memory, query_graph, explain,
add_source, scan_source, list_sources, assert_effect

## Pages

- [Home](${siteConfig.siteUrl}/): positioning, how it works, differentiators, deployment.
- [Features](${siteConfig.siteUrl}/features): the capability inventory — compiler pipeline,
  effect-links, governance, memory, hybrid retrieval, surfaces, deployment profiles.
- [Pricing](${siteConfig.siteUrl}/pricing): plans rendered from the open-core catalog —
  Free (local, forever), Pro, Enterprise (contact sales).
- [Enterprise](${siteConfig.siteUrl}/enterprise): security posture — tenant isolation,
  RBAC, OIDC SSO, quotas, audit trail, deployment sovereignty.
- [Skills](${siteConfig.siteUrl}/skills): first-party agent skills registry (in development).

## Related surfaces

- Dashboard: ${siteConfig.appUrl}
- Documentation: ${siteConfig.docsUrl}
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
