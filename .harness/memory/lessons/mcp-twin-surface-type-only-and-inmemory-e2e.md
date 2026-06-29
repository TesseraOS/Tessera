---
id: mcp-twin-surface-type-only-and-inmemory-e2e
kind: lesson
title: Keep a twin surface (MCP) honest with a type-only contract import + a real-client in-memory e2e
links:
  - apps/mcp/src/server.ts
  - apps/mcp/src/result.ts
  - apps/mcp/tests/e2e/mcp.e2e.test.ts
  - docs/adr/0017-mcp-server-surface.md
confidence: 0.9
created: 2026-06-29
---

**What happened:** F-012 adds the MCP surface alongside REST (F-011) — "one engine, two surfaces."
Two things made it clean:

1. **Express "same services as REST" with a *type-only* import.** `buildMcpServer(services:
   ApiServices)` imports `ApiServices` from `@tessera/api` with `import type`. That gives a
   compile-time guarantee the two surfaces wrap the *same* contract, at **zero runtime cost** — the
   import is erased, so Fastify never enters the MCP runtime. The trap: a *value* import (e.g.
   reusing the REST `mapError`) drags the whole api barrel (Fastify) into the MCP build. Verified
   with `grep "from '@tessera/api'" apps/mcp/dist/**/*.js` → only `.d.ts` references remain. The
   ~10-line error-envelope masking was duplicated locally (over `@tessera/core`) on purpose.

2. **Prove an MCP server with the SDK's own `Client` over `InMemoryTransport.createLinkedPair()`.**
   No subprocess, no stdio, no sockets — a genuine protocol client/server pair in one test process.
   Fast, deterministic, offline; satisfies "works with a real client end-to-end" for the e2e gate.

**How to apply:**
- For any second surface over shared services, depend on the existing services contract **type-only**
  and re-implement only the surface-specific glue. One engine, N surfaces, no runtime entanglement.
- Test MCP servers by connecting `new Client(...)` to `buildServer(...)` over a linked in-memory
  transport; assert `listTools()` + each `callTool(...)`. Domain errors come back as `isError: true`
  results (assert `structuredContent.error.code`); bad inputs reject — write the failure assertion to
  accept *either* a throw or an `isError` result.
- MCP SDK specifics: tool schemas are classic **Zod 3** raw shapes; declare **no `outputSchema`** to
  avoid output re-validation; SDK-inferred args are `T | undefined`, so widen mapper params (see
  [[zod-exactoptional-bridge]]). Twin of the REST surface: [[fastify-type-provider-zod-v4-bridge]].
