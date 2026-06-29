# @tessera/mcp

The **Model Context Protocol** surface over the Tessera engine (F-012; FR-35). Agent clients
(Claude Desktop/Code, Cursor, …) call tools that wrap the **same** domain services as the REST API
(F-011) — one engine, two surfaces, so they never diverge.

## Tools

| Tool | Wraps |
|------|-------|
| `search` | hybrid retrieval (F-009) — one fused, ranked candidate set |
| `compile_context` | context compilation (F-010) — provenance-tagged, budget-bounded package |
| `get_effects` | knowledge graph (F-008) — ranked dependents of a node, with paths |
| `capture_memory` | versioned memory (F-007) — stores a new memory version |
| `explain` | compiles, then projects per-fragment "why included" + provenance + the stage trace (no bodies) |

Tool inputs are validated by the SDK against Zod shapes (FR-35). Results carry both a text block
(JSON) and `structuredContent`. Failures surface a consistent, **masked** envelope
(`{ error: { code, message, details? } }`) — the same shape/policy as REST, never leaking internals.

## Design (ADR-0017)

- **Same services as REST:** `buildMcpServer(services: ApiServices)` reuses the `ApiServices`
  contract from `@tessera/api` as a **type-only** import — zero runtime coupling (no Fastify pulled
  into the MCP runtime).
- **Classic Zod 3** for tool schemas (the MCP SDK's API), consistent with the domain packages.
- **No `outputSchema`** — structured content passes through; domain services are the source of truth.
- **Transport:** `startMcpStdio(services)` serves over stdio. Real adapter wiring + the launchable
  process are **F-015**; `buildMcpServer` is a pure factory.

```ts
import { buildMcpServer, startMcpStdio } from '@tessera/mcp';

await startMcpStdio(services); // services: ApiServices (search/compiler/graph/memory)
// or: const server = buildMcpServer(services); await server.connect(transport);
```

## Tests

- **Unit** (`src/**/*.test.ts`, gate `test`): the `explain` projection.
- **E2E** (`tests/e2e/**`, gate `test:e2e`): a **real MCP `Client`** over a linked
  `InMemoryTransport` exercises every tool, a clean `NOT_FOUND`, and input rejection.
