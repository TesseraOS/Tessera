# @tessera/api

The versioned **REST surface** over the Tessera engine (F-011; ARCHITECTURE §11; FR-37,
NFR-1/6/11). Routes are thin — *validate → call a domain service → map result* — wrapping the
F-007…F-010 packages (memory, knowledge graph, hybrid retrieval, context compiler). MCP (F-012)
wraps the **same** services: one engine, two surfaces.

## Surface

| Method | Path | Wraps |
|--------|------|-------|
| `GET`  | `/health` | liveness (always `ok` while serving) |
| `GET`  | `/ready` | injected readiness probe (`503` until dependencies are reachable) |
| `GET`  | `/v1/openapi.json` | generated OpenAPI document |
| `POST` | `/v1/search` | hybrid retrieval (F-009) |
| `POST` | `/v1/compile` | context compilation (F-010) |
| `GET`  | `/v1/effects?kind&key&maxDepth` | `get_effects` (F-008) |
| `POST` `GET` `PATCH` | `/v1/memory`, `/v1/memory/:lineageId`, `/v1/memory/:lineageId/history` | versioned memory (F-007) |

All data routes live under `/v1`; changes are **additive** (NFR-11). Every failure uses one
envelope: `{ "error": { "code", "message", "details"? } }` (NFR-6), with `code` a stable
`@tessera/core` `ErrorCode`.

## Design

- **Schema-first (ADR-0002, ADR-0016).** One Zod schema per route drives **validation,
  serialization, and OpenAPI** via `fastify-type-provider-zod` + `@fastify/swagger`.
- **Zod version:** boundary schemas use the **Zod v4 API** (`import { z } from 'zod/v4'`) because
  `fastify-type-provider-zod@5` resolves schemas via Zod's v4 core. This is the same physical
  `zod@3.25.x` the workspace already installs (v4 lives at the `zod/v4` subpath) — domain packages
  keep the classic API, and only plain validated JSON crosses the boundary.
- **Dependency injection.** `buildServer(services, opts?)` takes the domain services + an optional
  `readiness()` probe. Constructing them from a deployment profile (Local: SQLite+sqlite-vec+
  filesystem+Transformers.js) and the bootable process are **F-015** — not this package.

```ts
import { buildServer, type ApiServices } from '@tessera/api';

const app = buildServer(services); // services: ApiServices (search/compiler/graph/memory)
await app.listen({ port: 3000 });  // or startServer(services, { port })
```

## Tests

- **Unit** (`src/**/*.test.ts`, gate `test`): error-envelope mapping, boundary-schema round-trips.
- **E2E** (`tests/e2e/**`, gate `test:e2e`): the full HTTP surface via `app.inject()` over an
  in-memory composition (test support — the production profile is F-015).
