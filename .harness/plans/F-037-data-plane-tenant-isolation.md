# Plan: F-037 — Data-plane per-tenant row isolation (FR-52)

- **Feature:** F-037 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-52, NFR-2
- **ADRs:** **0033 (new — data-plane tenant isolation via `forTenant` scoping)**; relates to 0028 (auth/tenancy/RBAC — the `tenantId` seam), 0003 (ports & adapters), 0026 (Postgres/pgvector)
- **Packages:** `@tessera/core` (primitive) · `@tessera/storage` (VectorStore) · `@tessera/memory` · `@tessera/knowledge-graph` · `@tessera/retrieval` · `@tessera/context-compiler` · `@tessera/api` + `@tessera/mcp` (threading) · **Author:** Claude · **Date:** 2026-07-03
- **Verification:** state · typecheck · lint · test · build · e2e (+ **live pgvector** container, env-guarded)

## Intent
Close the FR-52 seam carried out of F-025: `AuthContext.tenantId` is resolved + carried at the boundary
but the domain stores are **not tenant-scoped**, so there is no cross-tenant data guarantee. Give every
domain store **real per-tenant row isolation** — data written under tenant A is never visible under tenant B
— while keeping the zero-auth Local profile (single `default` tenant) **byte-for-byte unchanged**.

## Key decision (ADR-0033): `forTenant(tenantId)` scoped views, default = `DEFAULT_TENANT_ID`
- Promote the tenant primitive **`TenantId` + `DEFAULT_TENANT_ID='default'`** to **`@tessera/core`** (the
  dependency-free base every package imports) so domain packages scope by tenant without depending on
  `@tessera/api`. `@tessera/api/auth/model` **re-exports** them (its public API is unchanged; single source
  of truth). Additive on **E-006**.
- Each **store / retriever / service** gains **`forTenant(tenantId): Self`** returning a view whose reads &
  writes are confined to that tenant. The **base factory result is bound to `DEFAULT_TENANT_ID`**, so every
  existing test + the Local profile keep operating exactly as today (no signature changes on existing
  methods, no wire-schema change). Real tenancy engages only when a route/tool threads a non-default
  `tenantId`.
- Isolation is enforced **in the adapter** via a `tenant`/`tenant_id` column (or vec0 **partition key**) that
  is injected on write and filtered on every read — not a wrapper that could be bypassed.

## Per-store approach
- **VectorStore (`@tessera/storage`)** — `forTenant` on the port. `sqlite-vec`: add a `tenant TEXT
  partition key` to the `vec0` table (partitioned KNN, exact isolation). `pgvector`: add `tenant text NOT
  NULL DEFAULT 'default'`, filter `WHERE tenant = $n`, include in the `ON CONFLICT` upsert. Both keep
  passing the **shared** conformance suite (which now includes an isolation case). pgvector verified **live**
  against the Docker container (env-guarded).
- **Memory (`@tessera/memory`)** — `forTenant` on `MemoryStore` (in-memory + sqlite; `memories.tenant_id`),
  `MemoryService.forTenant`. Content/version model unchanged; `Memory` gains **no** tenant field (kept out of
  the wire shape — tenancy is a storage concern).
- **Knowledge graph (`@tessera/knowledge-graph`)** — `forTenant` on `GraphStore` (in-memory + sqlite;
  `tenant_id` on `graph_nodes`/`graph_edges`, filtered in every query **and both arms of the recursive
  `getEffects` CTE**), `KnowledgeGraphService.forTenant`. `getNodeByKey`/`nodeIdFor` stay per-tenant.
- **Retrieval (`@tessera/retrieval`)** — `forTenant` on the `Retriever` port + all five retrievers. Keyword
  (FTS5 `tenant UNINDEXED`) & temporal (`retrieval_temporal.tenant`) filter their **own** indices; semantic
  delegates to `vectorStore.forTenant`; graph/symbolic delegate to `graphStore.forTenant`.
  `HybridRetriever.forTenant` fans out to each child's `forTenant`.
- **Compiler (`@tessera/context-compiler`)** — `ContextCompiler.forTenant` → compiler over
  `retriever.forTenant(t)` + `graphStore.forTenant(t)`. No `ContextPackage`/`CompileRequest` shape change
  (tenancy stays off the wire); the corpus `FragmentSource` needs no scoping because scoped retrievers only
  emit the tenant's refs.

## Threading the boundary → data plane
- **REST (`@tessera/api`)** — each route resolves `request.authContext?.tenantId ?? DEFAULT_TENANT_ID` and
  calls `services.<x>.forTenant(tenantId).<method>(…)` (search / compile / effects / memory). Default profile
  → `'default'` → unchanged. Billing clamp (F-035) is unaffected.
- **MCP (`@tessera/mcp`)** — the `guard()` already returns the resolved `AuthContext`; capture it and use
  `ctx.tenantId`. Ungated (no gateway) → `DEFAULT_TENANT_ID`.

## Files to touch (high level)
- `packages/core/src/tenant.ts` (new) + `index.ts`; `apps/api/src/auth/model.ts` (re-export).
- `packages/storage`: `ports/vector.ts`, `adapters/{sqlite-vec,pgvector}/index.ts`,
  `tests/conformance/vector.conformance.ts`, `tests/integration/{sqlite-vec,pgvector}.test.ts`.
- `packages/memory`: `ports/memory-store.ts`, `adapters/*`, `service/memory-service.ts`,
  `tests/conformance/memory-store.conformance.ts`.
- `packages/knowledge-graph`: `ports/graph-store.ts`, `adapters/*`, `service/knowledge-graph-service.ts`,
  `tests/conformance/graph-store.conformance.ts`.
- `packages/retrieval`: `ports/retriever.ts`, `adapters/*`, `service/hybrid-retriever.ts`,
  `tests/conformance/retriever.conformance.ts`.
- `packages/context-compiler`: `compiler.ts` (+ retriever/graph-store interfaces it depends on).
- `apps/api/src/routes/v1/*`, `apps/mcp/src/server.ts`; e2e adds a cross-tenant isolation test.
- `docs/adr/0033-*.md` + index · `.harness/state/{feature_list,effects}.json` · `.harness/state/progress.md`.

## Anticipated effects
- **E-018** (auth/tenancy contract): the data-plane row-isolation **seam is realized** — `tenantId` now
  scopes every domain store (no longer "carried but not enforced").
- **E-001/E-007** (storage vector port + adapters + conformance), **E-010** (memory), **E-011** (graph),
  **E-012** (retrieval), **E-013** (compiler): each port gains `forTenant`; each adapter + shared
  conformance suite gain the isolation case.
- **E-003** (REST/MCP): routes/tools thread `tenantId`; response schemas + OpenAPI **unchanged** (SDK
  unaffected).

## Test plan
- **Conformance (every adapter):** write under tenant A, assert invisible under tenant B and intact under A —
  reads (`getById/getCurrent/list*`, graph `getNode*/list*/getEffects`, vector `query`, retriever `retrieve`)
  return only the caller-tenant rows; the default view is unchanged.
- **pgvector (live, env-guarded):** the same isolation case runs against the Docker container.
- **API e2e:** with the token provider, two tenants' memory captures are mutually invisible; the default
  (no-auth) build is unchanged.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` ·
`pnpm build` · `pnpm test:e2e`; then `docker compose up -d --wait postgres` + `TESSERA_TEST_POSTGRES=1`
storage tests for the live pgvector isolation.

## Risks / open questions
- **Broad, additive surface** → mitigate by keeping every existing method signature intact and defaulting the
  base view to `default` (existing suites unchanged), landing package-by-package with gates green at each step.
- **sqlite-vec partition key** (0.1.9) → if partitioned KNN misbehaves, fall back to a per-tenant `vec0`
  table; verified by the conformance isolation case.
- **CTE correctness** → tenant filter must be in **both** the anchor and recursive arms, else effects could
  leak; covered by the graph isolation test.
- **No tenant on the wire** → `ContextPackage`/`Memory`/API schemas keep no tenant field; isolation is a
  server-side storage guarantee driven by `AuthContext.tenantId` (SDK/OpenAPI untouched).
