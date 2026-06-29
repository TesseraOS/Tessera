# Plan: F-012 MCP server — search, compile_context, get_effects, capture_memory, explain

- **Feature:** F-012 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-35 (MCP interface) — from [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** `apps/mcp` , `@tessera/mcp`
- **Author:** Claude (Opus 4.8) · **Date:** 2026-06-29

## Intent
Expose the R0 engine over the **Model Context Protocol** so agent clients (Claude Desktop/Code,
Cursor, …) can `search`, `compile_context`, `get_effects`, `capture_memory`, and `explain` — wrapping
the **same** domain services the REST API (F-011) wraps, so the two surfaces never diverge. "Done" =
a real MCP client drives all five tools end-to-end, inputs are validated, and errors surface cleanly.

## Approach
`@modelcontextprotocol/sdk@1.29` `McpServer`. `buildMcpServer(services: ApiServices)` registers five
tools; handlers are **thin** (validate via the SDK → call a domain service → return). Reuses the
`ApiServices` contract from `@tessera/api` as a **type-only** import (zero runtime coupling, no
Fastify pulled in) — concretely expressing "same services as REST."

- **Input validation:** each tool's `inputSchema` is a Zod **raw shape** (classic Zod 3 — the SDK's
  expected API, and consistent with the domain packages; only `@tessera/api` used `zod/v4`). The SDK
  validates inputs and rejects bad calls (FR-35 "inputs validated").
- **Results:** `{ content: [text JSON], structuredContent }` with **no `outputSchema`** (so the SDK
  doesn't re-validate output — domain services are the source of truth). Errors map to a consistent,
  **masked** envelope (`{ error: { code, message, details? } }`, INTERNAL masked) — same shape/policy
  as REST, implemented locally (MCP input-validation differs from Fastify's, so no HTTP dep).
- **`explain`** = compile then project to per-fragment `whyIncluded` + provenance + the stage trace
  (FR-32/44), without fragment bodies. Pure `buildExplanation` (unit-tested).
- **Transport:** `startMcpStdio(services)` serves over stdio (what agent clients launch). Real adapter
  wiring + the launchable process are **F-015**; `buildMcpServer` is a pure factory.

**Increments:** scaffold + SDK install → introspect SDK API → schemas + result helpers + explain →
`buildMcpServer` (5 tools) → stdio entry → e2e via a real `Client` over `InMemoryTransport` +
in-memory composition → unit test (explain) → wire into gates (already active) → docs/ADR/record.

## Files to touch
- `apps/mcp/{package.json,tsconfig.json,vitest.config.ts,vitest.e2e.config.ts,README.md}`.
- `apps/mcp/src/{index,server,stdio,schemas,result,explain}.ts` (+ `explain.test.ts`).
- `apps/mcp/tests/e2e/{mcp.e2e.test.ts,support/in-memory-services.ts}`.
- `.harness/state/{effects.json (E-003 MCP half realized),progress.md,feature_list.json}`;
  `docs/adr/0017-mcp-server-surface.md` + ADR index; lesson.
  (No gate/CI changes — `test:e2e` activated in F-011; mcp just adds an e2e suite.)

## Anticipated effects
- **E-003** (REST/MCP contract ⇒ OpenAPI + SDK + web): F-012 *realizes the MCP half* — same services,
  same error-envelope shape. No interface change to the consumed services (E-010/11/12/13).

## Test plan
- **Unit:** `buildExplanation` projection (provenance + trace, omits bodies; conditional `expandedFrom`).
- **E2E (gate 6):** a real SDK `Client` over a linked `InMemoryTransport` — `tools/list` lists the
  five; search/compile/effects/capture/explain happy paths; `get_effects` unknown node → clean
  `NOT_FOUND` (isError); invalid input rejected.

## Verification
`state · typecheck · lint · format:check · test · test:e2e · build` — full workspace, green with evidence.

## Risks / open questions
- SDK output validation: avoided by declaring no `outputSchema` (structured content passes through).
- SDK-inferred args are `T | undefined` (exactOptional clash): bridged by widening the compile-request
  mapper's param (see [[zod-exactoptional-bridge]]).
- `@tessera/api` dependency must stay **type-only** or it drags Fastify into the MCP runtime — enforced
  by mapping errors locally. No open `OQ*`.
