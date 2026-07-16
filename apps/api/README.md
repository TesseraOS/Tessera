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
| `GET`  | `/v1/me` | the caller's resolved identity, tenant, and effective permissions (F-045) |
| `GET`  | `/v1/rbac` | the RBAC catalog: roles, permissions, role→permissions (F-046) |
| `GET` `POST` `DELETE` | `/v1/tokens`, `/v1/tokens/:id` | API-token self-service — list / create (secret once) / revoke; `admin:manage`, least-privilege (F-046) |

All data routes live under `/v1`; changes are **additive** (NFR-11). Every failure uses one
envelope: `{ "error": { "code", "message", "details"? } }` (NFR-6), with `code` a stable
`@tessera/core` `ErrorCode`.

## Hardening (F-044)

Cross-cutting security applied uniformly via plugins (never per-route), configured per deployment
profile through `@tessera/config`'s `api` section (`TESSERA_API_*` env). Safe local defaults keep
zero-friction dev.

- **Security headers** (on by default) — every response carries `Content-Security-Policy:
  default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`. `Strict-Transport-Security` is added **only** when
  `security.hsts` is set (TLS profiles). Explicit hooks, not `@fastify/helmet` — no new dependency,
  and the API is JSON-only so a strict CSP is safe. The SSE handler emits the same headers.
- **Rate limiting** on `/v1` (`rateLimit.enabled`, default off) — per-principal (fallback per-IP)
  fixed-window limiter (the F-026 `QuotaLimiter` pattern; distributed store = seam). Denials →
  `RATE_LIMITED` 429 envelope + `RateLimit-Limit/Remaining/Reset` and `Retry-After` headers.
- **CORS** — `cors.allowedOrigins` replaces the blanket policy with an exact allowlist (ADR-0035
  app↔api). Empty ⇒ the loopback-permissive local default.
- **SSE auth** — `GET /v1/events` lives inside the `/v1` auth scope, so under a non-none provider
  an unauthenticated request 401s (no bypass); locked by e2e.
- **Request-id correlation** — a sanitized inbound `x-request-id` is honored (else `req_<uuid>` is
  generated), bound into every request log line (`requestId`), echoed on the response, and (when
  observability is wired) attributed onto the active OTel span.

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
