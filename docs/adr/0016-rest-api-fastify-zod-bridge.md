# ADR-0016: REST API composition — Fastify + `fastify-type-provider-zod` (Zod-v4 bridge), injected services, e2e gate

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** Project lead, Claude
- **Tags:** backend, api, validation, openapi, verification

## Context

F-011 builds the versioned REST surface (`@tessera/api`) over the R0 engine (F-007…F-010):
`/v1` routes for search/compile/effects/memory, Zod validation at the boundary, OpenAPI
generated from the same schemas, a consistent error envelope, and `/health` + `/ready`
(FR-37, NFR-1/6/11). ADR-0002 chose Fastify and left a follow-up: "standardize on a Zod ⇄
JSON-Schema bridge so one source of truth drives validation, serialization, and OpenAPI."
Three decisions had to be made concretely, and one of them is a deviation worth recording.

1. **Which Zod⇄Fastify bridge**, and which Zod API it forces.
2. **How services reach the routes** without F-011 owning adapter wiring.
3. **Activating the e2e gate** (gate 6) — the first user-facing surface.

## Decision

**1. Bridge = `fastify-type-provider-zod@^5.1`, and the API package's boundary schemas use the
Zod **v4** API (`import { z } from 'zod/v4'`).** The type provider's `validatorCompiler` /
`serializerCompiler` / `jsonSchemaTransform` make one Zod schema per route drive validation,
serialization, **and** the `@fastify/swagger@^9` OpenAPI document (served at
`GET /v1/openapi.json`). `fastify-type-provider-zod@5.1` resolves schemas via
`instanceof $ZodType` (Zod's v4 core), so classic Zod-3 schema objects are rejected at runtime
("Invalid schema passed"). We therefore author `@tessera/api` boundary schemas with `zod/v4`.
This is **not** a second Zod install: the workspace already resolves a single `zod@3.25.x`, which
ships the v4 API at the `zod/v4` subpath. The rest of the workspace and the domain services keep
the classic Zod-3 API; only plain validated JSON crosses the API boundary into services (which
re-validate), so the two API surfaces never exchange schema objects.

**2. Services are injected (`ApiServices`), not constructed here.** `buildServer(services)` takes
the domain services + an optional `readiness()` probe. Constructing them from a deployment profile
(Local: SQLite+sqlite-vec+filesystem+Transformers.js, budgets, secrets) is **F-015**, which also
owns the bootable process. F-011 ships the server **factory** and surface; the bootable entry and
real wiring are F-015. Routes stay thin (validate → call service → map result); MCP (F-012) wraps
the same services — one engine, two surfaces. The consistent error envelope
(`{ error: { code, message, details? } }`) is one `setErrorHandler` mapping `TesseraError.code →
HTTP status`, with 5xx masked and request-validation failures → 400.

**3. The e2e gate (gate 6) goes `active`.** `@tessera/api` runs HTTP-surface e2e via
`app.inject()` (no socket). Root `test:e2e` → `turbo run test:e2e`; the CI workflow runs it.

## Consequences

### Positive
- One schema per route is the single source of truth for validation, serialization, and OpenAPI —
  exactly ADR-0002's follow-up. Clients/SDK (F-022) and the web Package Inspector (F-014) consume
  the generated contract.
- `buildServer(services)` is pure and trivially testable; the composition seam keeps F-011 free of
  adapter/config concerns and lets F-015 own deployment profiles cleanly.
- e2e via `inject` is fast and dependency-free; the gate now guards every user-facing surface.

### Negative / Costs
- The API package uses the `zod/v4` API while the rest of the repo uses classic Zod-3. This is a
  deliberate, contained split (one package, same physical dependency). Mitigation: schemas never
  cross into domain services as objects; a short note lives in the api rule/README.
- Response schemas must mirror domain types or the serializer 500s; covered by e2e per route.

### Neutral / Follow-ups
- Auth/CORS/helmet/rate-limit (per profile) = F-025/observability F-016; realtime SSE = F-021;
  generated SDK = F-022. When the workspace eventually moves to the Zod-4 classic API wholesale,
  the `zod/v4` import in `@tessera/api` collapses to plain `zod`.

## Alternatives considered

- **`fastify-type-provider-zod@4.0.2` (classic Zod-3).** Keeps one Zod API repo-wide, but it is an
  old line paired with `@fastify/swagger@8`-era output; we preferred the maintained 5.x on Fastify
  5 + swagger 9. Rejected.
- **Hand-written JSON Schema (ajv) + manual OpenAPI.** Two sources of truth, drift-prone, and
  contradicts ADR-0002's "OpenAPI falls out of the schemas." Rejected.
- **Construct real adapters in `@tessera/api`.** Duplicates F-015 (deployment profile/config
  loader) and couples the HTTP surface to storage choices. Rejected — inject instead.

## References

- Implements F-011; realizes the REST half of effect **E-003**.
- Related: [ADR-0002](0002-backend-framework-fastify.md) (Fastify; this fulfills its bridge
  follow-up), [ADR-0014](0014-test-organization-hybrid.md) (e2e in `apps/*/tests/e2e`),
  [ADR-0010](0010-ci-cd-github-actions.md) (CI mirrors the gates — effect E-005).
- `docs/PRD.md` FR-37, NFR-1/6/11; `docs/architecture/ARCHITECTURE.md` (API surface).
