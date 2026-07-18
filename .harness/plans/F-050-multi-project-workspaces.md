# Plan: F-050 — Multi-project workspaces: `(tenantId, projectId)` scope across the data plane + project switcher

- **Feature:** F-050 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-66, FR-52
- **ADRs:** **0037 (Accepted — multi-project workspaces)**; extends **0033** (data-plane tenant isolation via `forTenant`), relates to 0028 (auth/tenancy/RBAC), 0036 (CLI/MCP parity), 0034 (audit).
- **Service / packages:** `api` · `@tessera/core` (primitive) · `@tessera/storage` · `@tessera/memory` · `@tessera/knowledge-graph` · `@tessera/retrieval` · `@tessera/context-compiler` · `@tessera/ingestion` + `@tessera/config` (sources) · `@tessera/api` + `@tessera/mcp` (control plane + threading) · `apps/web` (dashboard) · **Author:** Claude · **Date:** 2026-07-19

## Intent
Introduce **Project as a first-class scope under the tenant** (ADR-0037): the data-plane scope becomes
`(tenantId, projectId)`. Each project owns its own sources, retrieval indices, fragments, memory, graph,
and compile-cache keys, so a team with several codebases keeps their context disjoint (retrieval never
bleeds across projects). A reserved `default` project preserves back-compat **byte-for-byte** exactly as
`DEFAULT_TENANT_ID` did in ADR-0033 — every existing test and every single-project deployment is unchanged.

## Key design decision — chained `forProject(projectId)`, base = `DEFAULT_PROJECT_ID`
ADR-0037 sanctioned either `forScope(tenantId, projectId)` **or** chained `forTenant(t).forProject(p)` and
delegated the choice to this feature. **Decision: chained `forProject(projectId): Self` on every port**,
mirroring the proven `forTenant` view (lesson: `forTenant-scoped-view-default-tenant-for-additive-row-isolation`).
Rationale:
- **Maximally additive.** Every existing `forTenant(t)` call site (routes, MCP, tests, conformance) is
  untouched and continues to operate in the tenant's `default` project. No existing method signature changes.
- The base factory view is bound to `(DEFAULT_TENANT_ID, DEFAULT_PROJECT_ID)`. `forTenant(t)` rebinds to
  `(t, DEFAULT_PROJECT_ID)` (a tenant switch resets to that tenant's default project — a project belongs to a
  tenant, so carrying a project across tenants is meaningless). `forProject(p)` rebinds the project only.
  The natural route call is `services.x.forTenant(t).forProject(p)`.
- Enforcement lives **in the adapter** (a `project_id` column / scoped table), injected on write and filtered
  on **every** read — never a bypassable wrapper. For deterministic ids (graph `nodeIdFor`) the scope predicate
  extends the composite PK to `(tenant, project, id)`. For recursive SQL (graph `getEffects` CTE) the project
  predicate goes in **both** the anchor and recursive arms.

No new ADR needed — ADR-0037 pre-decided the model and explicitly delegated this choice.

## Increment sequence (each independently verifiable + committable, gates green at every step)
1. **Scope primitive** — `@tessera/core`: add `ProjectId` + `DEFAULT_PROJECT_ID = 'default'` to `tenant.ts`
   (co-located with the tenant primitive); export from `index.ts`. `@tessera/api/auth/model` re-exports.
2. **VectorStore** (`@tessera/storage`) — `forProject` on the port; sqlite-vec (partition/scoped table) +
   pgvector (`project text NOT NULL DEFAULT 'default'`, in `WHERE` + `ON CONFLICT`); shared conformance gains a
   project-isolation case (write under (A,p1) → invisible under (A,p2) and (A,default), intact under (A,p1)).
3. **Memory** (`@tessera/memory`) — `forProject` on `MemoryStore`; in-memory + sqlite (`project_id` column,
   `ensureProjectColumn` additive migration, composite indices); `MemoryService.forProject`; conformance case.
4. **Knowledge graph** (`@tessera/knowledge-graph`) — `forProject` on `GraphStore`; in-memory + sqlite
   (`project_id` on nodes/edges, composite PK, predicate in **both** CTE arms); `KnowledgeGraphService.forProject`;
   conformance case (incl. `getEffects` isolation).
5. **Retrieval** (`@tessera/retrieval`) — `forProject` on `Retriever` + all five retrievers; keyword (FTS5)
   & temporal filter their own indices, semantic/graph/symbolic delegate to the scoped store; `HybridRetriever.forProject`
   fans out; conformance case.
6. **Compiler + cache key** (`@tessera/context-compiler`) — `ContextCompiler.forProject`; thread `projectId` into
   `computeCompilationKey` so the compile cache key **includes the project** (ADR-0037: else it goes ambiguous).
7. **Sources** (`@tessera/ingestion` + `@tessera/config`) — `forProject` on `SourceRegistry`; `SourceRecord` gains a
   visible `projectId` (control-plane entity); in-memory + `sqlite-source-registry`; conformance case. Ingestion/
   corpus-indexer scope threading so a scan lands in the source's project.
8. **Project entity + control plane** (`@tessera/api`) — `Project` domain + `ProjectStore` (in-memory + sqlite) +
   `ProjectService`; `/v1/projects` CRUD (list/create/get/rename/delete) with audited lifecycle (E-020); OpenAPI +
   SDK regen; the reserved `default` project is implicit and undeletable.
9. **Project selection at the boundary** — resolve `projectId` from **`X-Tessera-Project`** header (the one
   documented mechanism; omitted → `default`), validate it belongs to the caller's tenant on **every** request,
   thread `services.x.forTenant(t).forProject(p)` through every data route. Special-case `forProject` in the
   `@tessera/observability` instrument Proxy (as `forTenant` is) so the sync scoped view isn't promisified.
10. **MCP** (`@tessera/mcp`) — project CRUD tools (ADR-0036 parity) + session/config project selection.
11. **Dashboard** (`apps/web`) — project switcher in the app shell; create/manage projects; evolve the sidebar
    'New memory' button into a single **'+ New'** quick-create menu (memory / source / project; contextual
    default) with 'New project' inside the switcher + command palette (2026-07-04 product decision).
12. **Migration + e2e** — register the additive `project_id` column adds through the F-024 migration runner for
    the relational/pg adapters (reversible); SQLite adapters self-migrate on construction (existing pattern);
    cross-project isolation e2e (project A's content never surfaces in project B); full workspace gates + e2e.

## Anticipated effects (effect-link protocol)
- **E-001 / E-007** (storage vector port + adapters + conformance): port gains `forProject`; both adapters +
  shared conformance gain the project-isolation case.
- **E-010** (memory), **E-011** (graph), **E-012** (retrieval), **E-013** (compiler): each port gains `forProject`;
  adapters + conformance updated; compiler threads project into the cache key.
- **E-003** (REST/MCP contract): **new** `/v1/projects` endpoints + `X-Tessera-Project` header ⇒ OpenAPI + SDK
  regen + dashboard/MCP clients. Existing response schemas keep **no** project field (scope stays a server
  guarantee, like tenant) except `SourceRecord`/`Project` which are control-plane entities.
- **E-018** (auth/tenancy contract): scope widens from `tenantId` to `(tenantId, projectId)`; project id validated
  against the tenant on every request.
- **E-020** (audit): project lifecycle events audited; audit event context gains the project.
- Sources registry (E-0xx if present) + ingestion path: scan lands in the source's project.

## Test plan
- **Conformance (every adapter, every port):** "write under (tenant A, project p1) → invisible under (A, p2) and
  (A, default), intact under (A, p1); the default view is unchanged." Extends the existing tenant-isolation case.
- **Unit:** ProjectService lifecycle (create/rename/delete, reserved-default guard, cross-tenant reference
  rejected); compilation-key includes project; selection resolver (header → validated projectId, omitted →
  default, foreign project → rejected).
- **API e2e:** per-project sources/search/compile; cross-project isolation (A's content never surfaces in B);
  the default (no-header) build unchanged. **MCP e2e:** project tools + scoped session.
- **Web e2e:** project switcher creates/switches; '+ New' quick-create; scoped views render; axe clean.

## Verification
Per increment: `node scripts/verify-state.mjs` · `pnpm -w typecheck` · `pnpm -w lint` · `pnpm -w format:check` ·
`pnpm -w test` · `pnpm -w build`; API/MCP `test:e2e` and web e2e once those surfaces land; live pgvector
(`TESSERA_TEST_POSTGRES=1`, env-guarded) for the vector project-isolation case. Only green with captured evidence
counts (verification protocol). Commit each verified increment (commit cadence).

## Risks / open questions
- **Very broad additive surface** (~8 adapters + control plane + dashboard + migration) → mitigate exactly as
  F-037 did: keep every existing signature intact, default base view to `(default, default)`, land package-by-
  package with gates green at each step. Realistically spans multiple sessions; the increment list above is the
  resumable checklist.
- **Compile cache staleness** — the key MUST include the project or two projects share a cached package (ADR-0037
  named this). Covered by increment 6 + a key unit test.
- **Recursive CTE leak** — the graph `getEffects` project predicate must be in both arms (F-037 lesson). Covered
  by the graph conformance case.
- **Observability Proxy** — a sync method returning a scoped view is promisified by the tracing Proxy unless
  special-cased; add `forProject` alongside `forTenant` (F-037 lesson point 5). Covered by increment 9.
- **Selection mechanism** — `X-Tessera-Project` header chosen as the single documented mechanism (ADR-0037 left
  header-vs-param to this feature); recorded in OpenAPI. Not a default deviation → no ADR.
