# ADR-0017: MCP server surface — same services as REST, stdio transport, results without outputSchema

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** Project lead, Claude
- **Tags:** backend, mcp, api, validation

## Context

F-012 adds the **Model Context Protocol** surface (`@tessera/mcp`) so agent clients can use the
engine directly (FR-35). The tools are `search`, `compile_context`, `get_effects`, `capture_memory`,
`explain`. The architecture's "one engine, two surfaces" principle means MCP must wrap the **same**
domain services as the REST API (F-011), not re-implement anything. A few concrete decisions:

1. **How MCP shares the REST surface's services + error semantics** without coupling runtimes.
2. **Which Zod API** the tool schemas use (REST chose `zod/v4` for `fastify-type-provider-zod`).
3. **Tool result shape** (the SDK can validate outputs against an `outputSchema`).
4. **Transport** and how "works with a real client end-to-end" (acceptance) is proven.

## Decision

**1. `buildMcpServer(services: ApiServices)` reuses the REST `ApiServices` contract via a
**type-only** import from `@tessera/api`.** This expresses "same services as REST" with **zero
runtime coupling** — the import is erased, so Fastify is never pulled into the MCP runtime. The
error envelope **shape + masking policy** (`{ error: { code, message, details? } }`, `INTERNAL`
masked) matches REST but is implemented locally (MCP input validation is the SDK's job, unlike
Fastify/Zod), keeping MCP free of any HTTP dependency.

**2. Tool input schemas use classic Zod 3** (`@modelcontextprotocol/sdk@1.29` consumes Zod 3 via
`zod-to-json-schema`). This matches the domain packages; only `@tessera/api` uses `zod/v4` (a local
consequence of its type provider, ADR-0016). The SDK validates inputs against these shapes — FR-35's
"inputs validated."

**3. Tools return `{ content: [text JSON], structuredContent }` with no `outputSchema`.** The SDK
only validates structured content when an `outputSchema` is declared; omitting it avoids
output-validation failures while still giving typed clients `structuredContent` and legacy clients
text. Domain services remain the single source of truth. `explain` returns a **projection** of a
compiled package (per-fragment `whyIncluded` + provenance + the stage trace, no fragment bodies).

**4. Transport = stdio** (`startMcpStdio(services)`) — what agent clients launch. Acceptance is
proven with a **real SDK `Client`** connected to the server over a linked **`InMemoryTransport`**
(deterministic, offline) exercising every tool, the clean `NOT_FOUND`, and input rejection. Real
adapter wiring + the launchable process are **F-015**; `buildMcpServer` is a pure factory.

## Consequences

### Positive
- True "one engine, two surfaces": REST and MCP cannot drift — they share the `ApiServices` contract
  and the same domain services; F-013/F-026 (plugin host, MCP gateway) build on this seam.
- MCP runtime stays lean (no Fastify); errors are consistent and never leak internals.
- e2e over `InMemoryTransport` is fast, offline, and uses the genuine protocol/client.

### Negative / Costs
- The error-envelope masking exists in two places (REST handler + MCP `result.ts`); kept tiny and
  identical in policy. A future shared `@tessera/contracts` could host the envelope if a third
  surface appears.
- Tools without `outputSchema` aren't self-validating on output; covered by e2e per tool.

### Neutral / Follow-ups
- Multi-client auth + quotas (the MCP **gateway**) = F-026 (R2). Resources/prompts and richer
  capabilities can be added behind the same `McpServer`. The bootable stdio process = F-015.

## Alternatives considered

- **Re-declare the services interface in `@tessera/mcp`.** Drops the api dependency entirely but
  loses the compile-time guarantee that MCP and REST wrap the *same* contract. Rejected — the
  type-only import gives the guarantee at zero runtime cost.
- **Value-import `@tessera/api` `mapError`.** DRYs the masking but drags Fastify into the MCP
  runtime. Rejected — duplicate ~10 lines instead.
- **Declare `outputSchema` per tool.** First-class typed outputs, but re-validates large nested
  structures (e.g. `ContextPackage`) and risks output-validation errors like REST serialization.
  Rejected for R0; revisit if clients need negotiated output schemas.

## References

- Implements F-012; realizes the MCP half of effect **E-003**.
- Related: [ADR-0016](0016-rest-api-fastify-zod-bridge.md) (REST twin; shared `ApiServices`),
  [ADR-0002](0002-backend-framework-fastify.md), [ADR-0014](0014-test-organization-hybrid.md).
- `docs/PRD.md` FR-35; `docs/architecture/ARCHITECTURE.md` (MCP surface, one engine/two surfaces).
