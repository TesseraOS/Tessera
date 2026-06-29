# Plan: F-011 REST API /v1 (Fastify): schema validation, OpenAPI, health/ready

- **Feature:** F-011 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-37 (REST/JSON API), NFR-1 (typed boundaries), NFR-6 (consistent error
  envelope), NFR-11 (versioned, additive API) — from [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** `apps/api` , `@tessera/api`
- **Author:** Claude (Opus 4.8) · **Date:** 2026-06-29

## Intent
Expose the R0 engine (the domain services built in F-007…F-010) over a versioned HTTP/JSON
surface so an operator/agent can `search`, `compile_context`, query `get_effects`, and
capture/edit `memory`, with Zod validation at the boundary, a generated OpenAPI document, a
consistent error envelope, and liveness/readiness endpoints. "Done" = the four route groups
behave end-to-end through the server (provable by `app.inject()` e2e), `/v1/openapi.json`
reflects the schemas, and `/health` + `/ready` answer.

## Approach
Fastify v5 with the **plugin + encapsulation** model (ADR-0002, api rule). Routes are **thin**:
validate → call domain service → map result. **No business logic in handlers.** Domain logic
stays in the F-007…F-010 services; this package only adds the HTTP surface.

- **Zod ⇄ JSON-Schema bridge** = `fastify-type-provider-zod@^5.1` (the standardization ADR-0002
  flagged as a follow-up). One Zod schema per route drives **validation, serialization, and
  OpenAPI**. `@fastify/swagger@^9` builds the document via `jsonSchemaTransform`; we serve it at
  `GET /v1/openapi.json`. (Zod stays v3 — `5.1` peers `zod >=3.25.67`; workspace has `3.25.76`.)
- **Dependency-injection seam (`ApiServices`).** `buildServer(services, opts?)` takes the already
  constructed domain services + an optional `readiness()` probe. This is the composition seam
  **F-015** (deployment profile / config loader) fills with the real local stack
  (SQLite+sqlite-vec+filesystem+Transformers.js). F-011 does **not** wire real adapters — that is
  F-015's scope. A bootable process entry is therefore also F-015's (no shipped `main`/toy
  composition here). E2E uses an in-memory composition (test support) over `app.inject()`.
- **Error envelope** (NFR-6): `{ error: { code, message, details? } }` with `code` = the core
  `ErrorCode`. A single `setErrorHandler` maps `TesseraError.code → HTTP status`
  (VALIDATION→400, NOT_FOUND→404, CONFLICT→409, UNAUTHORIZED→401, FORBIDDEN→403, INTERNAL→500),
  Zod/Fastify validation failures → 400 VALIDATION (issues in `details`), anything else → 500
  INTERNAL with a generic message (never leak stacks/internals). `setNotFoundHandler` returns the
  same envelope.

**Reused:** `@tessera/core` errors/codes; `@tessera/memory` `MemoryService` +
`createInMemoryMemoryStore`; `@tessera/knowledge-graph` `KnowledgeGraphService` +
`createInMemoryGraphStore`; `@tessera/retrieval` `HybridRetriever`/`createHybridRetriever`;
`@tessera/context-compiler` `ContextCompiler`/`createContextCompiler`.

**Routes** (all data routes under `/v1`; additive/versioned — NFR-11):
- `GET  /health` · `GET /ready` (operational, unversioned).
- `POST /v1/search`            → `{ query, limit? }` → `{ results: FusedCandidate[] }`.
- `POST /v1/compile`           → `{ task, budget, retrievalLimit?, filters? }` → `ContextPackage`.
- `GET  /v1/effects`           → `?kind&key&maxDepth?` → `{ effects: EffectHit[] }`.
- `POST /v1/memory`            → capture → 201 `Memory`.
- `GET  /v1/memory`            → `?kind?&scope?` → `{ memories: Memory[] }`.
- `GET  /v1/memory/:lineageId` → current `Memory` (404 if absent).
- `PATCH /v1/memory/:lineageId`→ edit patch → `Memory` (404 if absent).
- `GET  /v1/memory/:lineageId/history` → `{ versions: Memory[] }`.
- `GET  /v1/openapi.json`      → generated OpenAPI document.

**Increments:** (1) package scaffold + deps + tsconfig; (2) error envelope + handler + unit tests;
(3) Zod schemas + type-provider/OpenAPI plugin; (4) health/ready; (5) v1 routes group; (6)
`buildServer` assembly; (7) e2e (inject) + in-memory composition; (8) wire `test:e2e` gate
(turbo + root script), activate gate 6, mirror into CI; (9) docs/ADR/effects/progress.

## Files to touch
- `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`,
  `apps/api/vitest.e2e.config.ts`, `apps/api/README.md` — package scaffold.
- `apps/api/src/index.ts` — public exports (`buildServer`, `startServer`, `ApiServices`, schemas,
  envelope types).
- `apps/api/src/server.ts` — `buildServer(services, opts)`; `startServer` thin listen wrapper.
- `apps/api/src/services.ts` — `ApiServices` + `Readiness` types (the DI seam).
- `apps/api/src/errors/envelope.ts`, `apps/api/src/errors/error-handler.ts` (+ `.test.ts`).
- `apps/api/src/plugins/openapi.ts` — `@fastify/swagger` + zod transform.
- `apps/api/src/schemas/{common,search,compile,effects,memory}.ts` — boundary Zod schemas (+ a
  `schemas.test.ts` round-trip).
- `apps/api/src/routes/health.ts`, `apps/api/src/routes/v1/{index,search,compile,effects,memory}.ts`.
- `apps/api/tests/e2e/*.test.ts` + `apps/api/tests/e2e/support/in-memory-services.ts`.
- Root `package.json` (`test:e2e` script), `turbo.json` (`test:e2e` task).
- `.harness/verification/gates.json` (gate 6 → active), `.github/workflows/ci.yml` (e2e step) —
  effect **E-005**.
- `docs/adr/0016-rest-api-fastify-zod-bridge.md`, ADR index; `.harness/state/effects.json`
  (E-003 realized), `.harness/state/progress.md`, `feature_list.json` (→ done).

## Anticipated effects
- **E-003** (REST/MCP contract ⇒ OpenAPI + generated SDK + web): this feature *realizes* the REST
  half — establishes the `/v1` contract + the generated OpenAPI doc. F-012 (MCP) wraps the **same**
  services; F-022 (SDK) + F-014 (web) consume the contract. Recorded as advancing E-003.
- **E-005** (gates.json ⇄ ci.yml ⇄ verification.md): activating gate 6 (e2e) requires updating the
  CI workflow to run it. Mirror kept in lockstep.
- Consumes (no change to) the service contracts E-010/E-011/E-012/E-013 — additive consumer only.

## Test plan
- **Unit:** error-handler mapping (each `ErrorCode` → status; Zod failure → 400; unknown → 500,
  no leak); a schema round-trip (valid parses, invalid rejected).
- **E2E (user-facing — activates gate 6):** via `app.inject()` over an in-memory composition —
  health/ready 200; search returns ranked results; compile returns a budget-bounded package with
  provenance; effects returns ranked dependents and 404 for an unknown node; memory
  capture→get→edit→history→list happy paths + 404 + 400 validation; error envelope shape;
  `/v1/openapi.json` is a valid OpenAPI doc listing the `/v1` paths.

## Verification
Gates (stop at first failure), evidence captured in `progress.md`:
`state` · `typecheck` · `lint` · `format:check` · `test` · **`test:e2e` (newly active)** · `build`.
Full-workspace run with the new package included.

## Risks / open questions
- **Response serialization strictness:** the zod `serializerCompiler` validates responses; an
  over-strict schema can 500 on valid data. Mitigate by mirroring the domain types exactly and
  covering each route in e2e. Free-form fields use `z.record(z.unknown())`.
- **Two Zod majors:** avoided by pinning `fastify-type-provider-zod@^5.1` (Zod-3 line).
- **Scope discipline:** auth/CORS/helmet/rate-limit (per profile) = F-025/observability F-016;
  realtime SSE = F-021; real adapter wiring + process boot = F-015. Out of scope here.
- No open `OQ*` blocks this.
