# Plan: F-071 Scope-aware ingestion — scanned content lands in the (tenant, project) that registered the source

- **Feature:** F-071 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-52 (org/workspace isolation), FR-62 (source management), FR-6 (ingestion)
- **Service / package:** `@tessera/ingestion` → `@tessera/config` → `@tessera/api` / `@tessera/mcp` → `tests/e2e-full`
- **Author:** planner subagent · **Date:** 2026-07-22

## Intent

A scan must index into the `(tenant, project)` that owns the source. Today it indexes into
`(default, default)` unconditionally, so in any token/OIDC deployment a scan reports `added: 3` while
the tenant that asked for it sees nothing.

**Done looks like:** a user signs in as tenant `acme`, registers a repo, scans it, and *searches,
compiles, and browses the graph over that repo as `acme`* — while tenant `globex` and project `beta`
see none of it; and the scan can no longer claim success for work that never reached the caller's
scope.

## The defect, confirmed in code

[`packages/config/src/sources/ingestion-sink.ts`](../../packages/config/src/sources/ingestion-sink.ts)
calls `indexer.indexDocument({ ref, text, kind, metadata })` with **no `tenantId` / `projectId`**, so
[`corpus-indexer.ts`](../../packages/config/src/sources/corpus-indexer.ts) defaults both to
`DEFAULT_TENANT_ID` / `DEFAULT_PROJECT_ID`. Its own doc comment records this as the "F-038 boundary".

The cause is one layer up: `SourceRecord` carries `tenantId` + `projectId`
([`registry.ts`](../../packages/ingestion/src/sources/registry.ts)), but **`SourceDescriptor`** — the
only thing the coordinator puts on the queue job — does not
([`domain.ts`](../../packages/ingestion/src/domain.ts)). The worker therefore has no scope, and the
sink is constructed **once per runtime** in
[`local.ts`](../../packages/config/src/profiles/local.ts), not per tenant. So the scope has to travel
*with the job*; a closure cannot capture it.

Three consumers share the flaw, all in that one `teeSink`:

| Sink | Writes to | Today |
|---|---|---|
| `createIndexingDocumentSink` | corpus + keyword/temporal/vector | `(default, default)` |
| `createGraphExtractionSink` | knowledge graph (file/symbol nodes, effect-links) | base (unscoped) `graph` service |
| `createMemoryExtractionSink` | auto-extracted decision/lesson memories | base (unscoped) memory service |

Nothing catches it: api/mcp e2e run zero-auth in the default tenant, and F-048's full-stack suite
**pins itself to `default`** with a comment naming this feature
([`full-stack-server.mjs`](../../tests/e2e-full/support/full-stack-server.mjs)).

## The design fork — where does `(tenantId, projectId)` live?

### (a) On `SourceDescriptor` — **rejected**

It is already on every `ChangeEvent`, and a source *is* owned by a tenant, so this looks free. It is
not: `SourceDescriptor` is also embedded in **`ProcessedDocument.source`**, which is the input/output
type of the **`Processor` port** and the argument to `SymbolExtractor.extract()` and the memory
extractors — i.e. the plugin SDK (E-009, ADR-0020). Two problems:

1. It puts a deployment concern into the third-party stage contract — the precise thing ADR-0033
   refused when it kept tenancy off `Memory`/`ContextPackage`.
2. Processors *return a new `ProcessedDocument`*. Scope flowing through a mutable plugin pipeline
   means a stage could rewrite it: tenancy would become **forgeable by a plugin**. Isolation must not
   be laundered through untrusted code.

(It does not reach the product wire today — the indexing sink only copies `source.id` into metadata —
but "it happens not to leak yet" is not a contract.)

### (c) Scope resolved at the worker from the registry — **rejected**

No job-contract change, but:

- `SourceRegistry.get(id)` is **scoped**: a view for tenant A returns `undefined` for B's source. A
  worker with no tenant would need a new unscoped `getAny(id)` — a hole punched in the port whose
  entire purpose is isolation (ADR-0033 "enforcement lives in the adapter, not a bypassable wrapper").
- The alternative — a process-wide `Map<SourceId, scope>` populated at scan time, mirroring
  `SourceService.connectorFor` — dies the moment the queue is BullMQ with a separate worker process.
  The job would arrive with no way to learn its scope and would fall back to… the default tenant.
  **A fix that silently reintroduces this exact bug under the documented future deployment is not a
  fix.**
- Plus a registry read per job on the ingest hot path, and an undefined failure mode when a source is
  deleted mid-scan.

### (b) A `scope` field on `ChangeEvent` — **RECOMMENDED**

`ChangeEvent` is the job envelope, already documented as "plain, JSON-serializable data so it survives
a real queue transport (BullMQ) unchanged". `IngestionScope` is two strings — it survives serialization
by construction. It keeps the descriptor and `ProcessedDocument` clean, needs no registry hole, and
costs one required field on a type constructed in exactly **one** place (`diffEntries`, called only by
the coordinator; `ChangeEvent` appears in only 4 source files).

Make it **required, not optional**. An optional scope with a `?? DEFAULT_TENANT_ID` fallback preserves
the failure mode we are removing: a producer that forgets it writes to `default` and nobody notices.
Required means the compiler enumerates every producer, once.

> This reverses a documented decision: ADR-0040 "Alternatives considered" explicitly rejected
> *"threading tenant through every ChangeEvent/ProcessedDocument"* for F-038. We adopt **half** of it —
> `ChangeEvent` yes, `ProcessedDocument` no — and that split is the whole point. **This requires an ADR**
> (golden rule 7).

### `DocumentSink` — scoped views, not a per-call parameter

The port keeps `upsert(document)` / `remove(ref)` **byte-identical** and gains the codebase's existing
scoping idiom:

```ts
export interface DocumentSink {
  upsert(document: ProcessedDocument): Promise<void>;
  remove(ref: DocumentRef): Promise<void>;
  /** A view bound to `tenantId` (reset to its default project) — writes never cross tenants (ADR-0033). */
  forTenant(tenantId: TenantId): DocumentSink;
  /** A view bound to `projectId` within the current tenant (ADR-0037). */
  forProject(projectId: ProjectId): DocumentSink;
}
```

The worker does `sink.forTenant(scope.tenantId).forProject(scope.projectId).upsert(document)`.

Why views over `upsert(document, scope)`:

- **It is what every other scoped thing in this repo does** — `MemoryStore`, `GraphStore`,
  `VectorStore`, `Retriever`, `ContextCompiler`, `SourceRegistry`, `SourceService`,
  `createIndexingMemoryService` (the sink's own sibling in the same directory, which already takes
  `tenantId`/`projectId` and rebinds itself in `forTenant`/`forProject`). Reuse the idiom, add no new one.
- **It is compiler-enforced.** New *required members* mean every implementer must answer "what does
  scope mean for me?" A second parameter is silently ignorable — TypeScript happily assigns
  `upsert(document)` to `upsert(document, scope)`, so `teeSink` could drop the scope and still compile.
  Given that this feature exists because a scope was silently dropped, that matters.
- Existing method signatures are unchanged ⇒ additive, green at every step (the ADR-0033 strategy).

**Blast radius (every implementer + double):** `in-memory-sink.ts`, `tee-sink.ts`,
`memory-extraction-sink.ts`, `graph-extraction-sink.ts` (all in `@tessera/ingestion`) and
`createIndexingDocumentSink` (`@tessera/config`). `apps/api` + `apps/mcp` e2e supports call
`createInMemoryDocumentSink()` and are **unchanged** (the factory implements the new members).

Two structural interfaces widen so the decorator sinks can rebind their targets — both are already
satisfied by the real services, so only in-repo fakes change:

- `GraphWriteService` ([`symbols/extractor.ts`](../../packages/ingestion/src/symbols/extractor.ts))
  gains `forTenant`/`forProject` (real `KnowledgeGraphService` has them).
- `MemoryCaptureService`
  ([`memory-extraction-sink.ts`](../../packages/ingestion/src/adapters/memory-extraction-sink.ts))
  gains them (real `MemoryService` has them); `tests/support/fake-memory-service.ts` grows two methods.

**On the memory-extraction sink:** acceptance clause 1 names only the indexing + graph sinks, and I am
not smuggling in scope creep — the port design *forces* the question. Once `forTenant` is a required
member, `createMemoryExtractionSink` must either rebind the memory service (≈4 lines) or return `this`
and knowingly keep writing tenant A's ADR-derived memories into `default`. Rebinding is the only
defensible answer; flagging it here rather than deciding it silently.

### The worker validates the job

The queue is a boundary (rule: *validate at boundaries*). The worker rejects a job whose `scope` is
missing/blank with a `ValidationError` rather than defaulting. **That guard is the permanent
anti-regression device for this whole feature**: never silently default, ever again.

## Acceptance clause 3 — what actually makes the scan report honest

> *"A scan can no longer report success while indexing nothing the caller can see."*

Landing the scope fix is **necessary but not sufficient**, and I will not hand-wave it. `ScanSummary`
is computed by the **coordinator, before any work happens** — it counts what the *diff enqueued*
([`coordinator.ts`](../../packages/ingestion/src/pipeline/coordinator.ts)). And
`createInProcessQueue` **swallows job failures** after retries by design
([`in-process-queue`](../../packages/storage/src/adapters/in-process-queue/index.ts):
*"Swallow failures after retries are exhausted so one bad job can't reject enqueue"*). So today — and
after the scope fix — a scan whose every job threw (embeddings provider down, disk full) still returns
`added: 3`. The sentence in the acceptance would remain literally true of the system.

So add one honest, post-work number, reusing what F-081 already built:

- `performScan` already subscribes to the ingestion bus **before** the diff enqueues anything and
  counts distinct paths for progress. Add the same for `document.ingested` + `document.removed` —
  which the worker emits **only after** a successful `sink.upsert`/`sink.remove` + manifest write.
- Surface it as `indexed?: number` on `SourceScanResult` and `SourceScanStatus.lastScan`, documented
  precisely as *"distinct paths this scan successfully persisted through the sink"*.
- **Optional on purpose.** It is populated only when the scan actually waited for completion
  (`queue.drain` exists — the Local profile). With an async adapter the number would be a lower bound,
  and an absent field beats a wrong one (the same reasoning as `lastScanAt`'s nullability).
- `ScanSummary` itself is **not** touched: `added + modified + removed` is F-081's progress
  denominator and is on the wire; changing its meaning would break the progress bar and the SDK.

Surfacing cost, stated plainly: MCP `scan_source` returns a plain object with **no `outputSchema`**,
so the agent surface is free. REST costs one optional field on `scanStatusResponseSchema` ⇒ regenerate
`@tessera/sdk` **and** `apps/docs/generated/*` (the docs drift test regenerates in the `test` gate and
asserts byte-identity). Both are mechanical and gated. No dashboard work — no UI clause in the
acceptance.

## Acceptance clause 4 — exactly what changes in `tests/e2e-full`

In [`support/full-stack-server.mjs`](../../tests/e2e-full/support/full-stack-server.mjs):

1. **Delete** the "Do not change this to a non-default tenant without fixing F-071 first" block and
   the `const TENANT = 'default'` it guards.
2. Replace with two real tenants: `const PRIMARY_TENANT = 'acme'` and `const OTHER_TENANT = 'globex'`.
   Issue an owner token for each via the real token store.
3. Register + scan the existing `fixture/` under `(acme, default)` — as today, but now under a real
   tenant. Additionally register + scan a **new tiny `fixture-b/`** (one file, unique term `sunstone`)
   under `(globex, default)` **and** under `(acme, beta)` — creating project `beta` through the real
   project service first. Doing setup here (not in a spec) keeps it deterministic: this file has direct
   runtime access and `sources.scan()` awaits the drain, so no polling.
4. Keep the fail-fast `summary.added !== FIXTURE_FILE_COUNT` guard and add its twin for `fixture-b`.
5. Publish the extra scopes in `handoff.json`; type them in
   [`support/handoff.ts`](../../tests/e2e-full/support/handoff.ts).

In [`tests/agent-journey.spec.ts`](../../tests/e2e-full/tests/agent-journey.spec.ts): delete the
"The tenant is the deployment's default one for a second reason … **F-071**" note. Its
`TESSERA_AUTH_TENANT: handoff.tenantId` is already dynamic, so the agent journey now runs as `acme`
with no other change. The **F-072** note about stdio credentials stays — that gap is real and is not
this feature.

The human journey needs no edits: it drives the dashboard with `handoff.token`, which is now acme's.
If it fails, the fix is wrong — that is the point.

## Approach — six increments, each independently verifiable, gates green between commits

**0 · Governance.** ADR-0057 *"Ingestion scope travels on the queue job"* (decides: scope on the job
envelope; `DocumentSink` scoped views; the queue as an internal trusted transport with its threat
model; supersedes ADR-0040's deferral and closes ADR-0050's documented `document.*` gap). Add
`e2e-full` to F-071's `verification` array — clause 4 demands that gate. Commit this plan.
_Gate:_ `state`.

**1 · The scope travels, end to end.** `IngestionScope` + `ChangeEvent.scope` (required) + `diffEntries`
stamps it + coordinator takes it + `SourceService.performScan` supplies it from the `SourceRecord` +
worker validates it and resolves `sink.forTenant().forProject()` + `DocumentSink` gains the views +
all five sinks implement them. Workspace typecheck forces `@tessera/config`'s indexing sink into this
same commit — correct, that *is* the mechanism. Delete the now-false "ingestion runs in the default
tenant (F-038 boundary)" comments as they are made false, never after.
_Gates:_ `typecheck lint format test build`, plus the red-before evidence (below).

**2 · SSE attribution.** `document.ingested`/`document.removed`/`document.processed` carry the scope;
`local.ts` drops `INGESTION_TENANT` and bridges `event.scope.tenantId`.
**This is required for correctness, not a nicety:** after increment 1 the write really goes to `acme`,
so leaving the bridge pinned to `default` would start *leaking acme's file paths onto the default
tenant's event stream* while acme's own feed stays empty. Increment 1 without increment 2 ships a new
cross-tenant leak. Rewrite the ADR-0050 note in `domain.ts` (it says the worker "has no tenant" — it
will).
_Gates:_ `typecheck lint format test build`.

**3 · The honest number.** `indexed` counted in `performScan`; on `SourceScanResult` +
`SourceScanStatus.lastScan`; MCP `scan_source` returns it; REST `scanStatusResponseSchema.lastScan`
gains it; `pnpm --filter @tessera/sdk generate` then `pnpm --filter @tessera/docs generate`, both
regenerated artifacts committed.
_Gates:_ `typecheck lint format test build e2e`.

**4 · Prove isolation over a real deployment.** e2e-full switched onto real tenants + projects
(clause 4) and a new REST-only `scope-isolation.spec.ts` (clauses 2 + 5).
_Gates:_ `e2e`, `e2e-full`.

**5 · Record.** `effects.json` (E-009/E-014/E-018/E-003), `progress.md` with the captured red-before
output, `feature_list.json` → `done`, a memory lesson.
_Gate:_ `state`.

## Files to touch

**`@tessera/ingestion`**
- `src/domain.ts` — `IngestionScope`; `ChangeEvent.scope`; scope on the three `document.*` events;
  rewrite the ADR-0050/F-071 tenancy note.
- `src/connectors/scan-diff.ts` (+ `.test.ts`) — stamp `scope` on every emitted event.
- `src/pipeline/coordinator.ts` — `IngestionCoordinatorOptions.scope`.
- `src/pipeline/worker.ts` — validate `event.scope`; resolve the scoped sink for `handle` + `forget`;
  attach scope to emitted events.
- `src/ports/sink.ts` — `forTenant`/`forProject` on `DocumentSink`.
- `src/adapters/in-memory-sink.ts` — scope-partitioned storage; base view `(default, default)` so every
  existing default-scope test is byte-for-byte unchanged.
- `src/adapters/tee-sink.ts` — forward the scoped views to each member.
- `src/adapters/memory-extraction-sink.ts` (+ `.test.ts`) — rebind `MemoryCaptureService`; widen it.
- `src/adapters/graph-extraction-sink.ts` — rebind `GraphWriteService`.
- `src/symbols/extractor.ts` — widen `GraphWriteService`.
- `src/sources/service.ts` (+ `.test.ts`) — supply the record's scope; count `indexed`.
- `tests/conformance/document-sink-scope.conformance.ts` **(new)** — see Test plan.
- `tests/support/fake-memory-service.ts`, `tests/integration/*` — call sites + scope cases.

**`@tessera/config`**
- `src/sources/ingestion-sink.ts` — scoped views over `CorpusIndexer` (mirror `createIndexingMemoryService`).
- `src/profiles/local.ts` — SSE bridge off `INGESTION_TENANT`; corrected comments.
- `tests/integration/runtime-ingestion-scope.test.ts` **(new)** — the red-before proof.

**Surfaces**
- `apps/api/src/schemas/sources.ts` — optional `lastScan.indexed`.
- `apps/mcp/src/server.ts` — `scan_source` returns `indexed`.
- `packages/sdk/openapi.json`, `packages/sdk/src/generated/schema.ts`, `apps/docs/generated/**` — regenerated.
- `apps/api/tests/e2e/sources.e2e.test.ts` — assert `indexed` on the status.

**e2e-full**
- `support/full-stack-server.mjs`, `support/handoff.ts`, `tests/agent-journey.spec.ts`,
  `tests/scope-isolation.spec.ts` **(new)**, `fixture-b/` **(new)**.

**Governance / state**
- `docs/adr/0057-ingestion-scope-on-the-queue-job.md` **(new)**;
  `.harness/state/{effects,feature_list}.json`, `.harness/state/progress.md`,
  `.harness/memory/lessons/`.

## Anticipated effects

- **E-009 — `@tessera/ingestion` ports (the live one).** `DocumentSink` gains `forTenant`/`forProject`
  (existing signatures unchanged); `ChangeEvent` gains a **required** `scope`; `IngestionEvents`
  `document.*` gain scope. Dependents: all five sinks, `teeSink`, the pipeline integration test,
  `apps/{api,mcp}` e2e supports (compile-clean), and — the non-obvious one — **the `Queue` port's
  future durable adapters (E-001, "later bullmq")**: the job payload is now a contract that must
  survive serialization intact. Record that as an item under E-009 rather than minting a new effect id;
  `ChangeEvent` is already inside E-009's stated surface.
- **E-014 — composition root.** The existing item literally instructs this: *"When F-071 carries the
  tenant onto the queue job, replace `INGESTION_TENANT` with the event tenantId."* Rewrite it; also
  record that `createIndexingDocumentSink` is now scope-aware.
- **E-018 — auth/tenancy.** The data-plane isolation guarantee (ADR-0033/0037) now covers **ingested
  content**, which was its one remaining hole; F-050's carve-out note ("Ingestion scan-content-into-project
  is carved out to F-071") is closed.
- **E-003 — REST/MCP contract.** Additive optional `indexed` on `GET /v1/sources/:id/scan`; MCP
  `scan_source` result gains it (no schema). OpenAPI + SDK + docs `generated/` regenerate. No breaking
  change; `apps/web/lib/api/types.ts` is a hand-written mirror that stays valid (the field is optional
  and no UI reads it — deliberately not mirrored, so we do not add unused surface).
- **Decisions:** ADR-0057 (new) supersedes ADR-0040's rejected alternative and closes ADR-0050 §
  consequences + ADR-0041's "ingestion populates the default tenant" seam.

## Test plan

**Red before green — the evidence that matters.** `packages/config/tests/integration/runtime-ingestion-scope.test.ts`
is written **against today's API** (`sources.forTenant('acme')`, `search.forTenant('acme')`) so it
compiles and *fails* at HEAD before a line of `src/` changes. Run it first, capture the output into
`progress.md` and the increment-1 commit message, then implement. Never commit it red.

- **Unit — ingestion**
  - `diffEntries` stamps the scope on `added`/`modified`/`removed`.
  - The worker throws `ValidationError` on a job with a missing/blank scope (never defaults).
  - The worker routes to `sink.forTenant(t).forProject(p)`; a scan under `(A, P1)` leaves the in-memory
    sink's `(B, …)` and `(A, P2)` partitions empty.
  - `teeSink` forwards the scope to **every** member (the silent-drop regression guard).
  - `createMemoryExtractionSink` captures through the scoped memory service; `createGraphExtractionSink`
    writes through the scoped graph.
  - `SourceService.scan` reports `indexed === total` on success, and `indexed: 0` with a throwing sink
    while `added` stays 3 — the clause-3 proof. (Capture today's behaviour first: `added: 3`, no
    contradicting signal anywhere.)
- **Conformance** — `registry.conformance.ts` **needs no change**: it already carries both tenant and
  project isolation cases, and the catalog was never the bug. There is **no `DocumentSink` conformance
  suite** today (`tests/conformance/` holds only `connector.conformance.ts`), and I am *not* proposing a
  general behavioural one — the sinks are decorators with deliberately different semantics (the memory
  sink's `remove` is a no-op by design), so a shared behaviour suite would be meaningless. But one
  property is now universal and worth ~40 shared lines: **scope routing** — "the base view is
  `(default, default)`, and an op on `forTenant(t).forProject(p)` reaches the target in that scope."
  Add `tests/conformance/document-sink-scope.conformance.ts` and run it against the in-memory sink, a
  tee over a probe, and (from `@tessera/config`'s tests) the indexing + graph sinks — so every future
  sink inherits the guarantee, exactly as ADR-0033 did for the stores.
- **Integration — real runtime (`@tessera/config`)** — the matrix, in the fast `test` gate:
  content scanned under `(acme, default)` is searchable/compilable as `acme`, produces graph nodes for
  `acme`, and yields **zero** hits, **zero** graph nodes and a **0-section** package for `globex`, for
  `(acme, beta)`, and for `(default, default)`. Same in reverse for content scanned under `(acme, beta)`.
  Auto-extracted memories land in the scanning tenant, not `default`. Plus: the SSE bridge emits
  `document.ingested` with `tenantId: 'acme'` (the increment-2 leak guard).
- **E2E — `tests/e2e-full/tests/scope-isolation.spec.ts` (new, REST-only, no browser)** — over the one
  live deployment, using the real tokens and `X-Tessera-Project`:

  | `POST /v1/search` | as `acme`/default | as `globex` | as `acme`/`beta` |
  |---|---|---|---|
  | `quernstone` | hits | 0 | 0 |
  | `sunstone` | 0 | hits | hits |

  plus `POST /v1/compile` for `quernstone` → sections > 0 as acme/default, **0 sections** as globex;
  and `GET /v1/effects` for `src/ledger` → `src/reporting` as acme/default, empty as globex.
  This is clauses 2 and 5 in one file.
- **Regression** — the whole point of the additive strategy: `packages/ingestion` (18 files),
  `apps/api`/`apps/mcp` e2e, `runtime-sources.test.ts` and the F-048 journeys stay green. Any change to
  a default-scope assertion means the base view drifted off `(default, default)` — investigate, do not
  edit the assertion.

## Verification

Run in gate order, stop at first failure, capture counts as evidence
([protocol](../protocols/verification.md)):

```
node scripts/verify-state.mjs
pnpm -w typecheck
pnpm -w lint
pnpm -w format:check
pnpm -w test
pnpm -w build
pnpm -w test:e2e
pnpm -w test:e2e:full
```

Targeted during the loop: `pnpm --filter @tessera/ingestion test`,
`pnpm --filter @tessera/config test`; after increment 3:
`pnpm --filter @tessera/sdk generate` + `pnpm --filter @tessera/docs generate` (the docs drift test
fails the `test` gate if either is stale).

Evidence to record in `progress.md`: per-gate pass counts; the **captured pre-fix failure output** of
`runtime-ingestion-scope.test.ts`; and the e2e-full console line showing the deployment running under
`tenant=acme`.

## Risks / open questions

- **OQ — ADR required before coding (increment 0).** Two decisions deviate from documented positions
  and must be recorded first: (i) scope on `ChangeEvent`, reversing ADR-0040's explicit rejection;
  (ii) `DocumentSink` gains scoped views. Draft title: **ADR-0057 — Ingestion scope travels on the
  queue job**. It must also state the **threat model**: the queue becomes a scope-bearing channel. In
  process, the only producer is the trusted coordinator. With a shared/durable broker, a job is a trust
  boundary — worker-side validation against the registry, or job integrity, becomes required. The
  worker's scope validation is the first half of that; the rest is a documented seam, not built here.
- **ADR-0050 amendment.** Its consequences say non-default tenants will not see `document.*`. That
  becomes false. Prefer recording the closure in ADR-0057 + fixing the stale code comments over
  rewriting an accepted ADR's Decision; confirm with the lead.
- **SSE has no project dimension.** `ApiEventMap` is tenant-scoped only, so the bridge threads
  `scope.tenantId` and nothing else. Within a tenant, project A's paths still reach project B's
  stream — **pre-existing** (true of every `source.scan.*` event since F-050) and outside this
  acceptance. Flag it as a finding for the backlog; do **not** build project-scoped SSE here.
- **Blob keys stay global.** The corpus blob is one ref space; only the indices are scoped, so nothing
  cross-scope is *reachable* — but per-tenant blob keying remains **F-075**. This feature must not claim it.
- **`IngestionManifest` stays unscoped, deliberately.** It is keyed by `SourceId`, which is globally
  unique and only reachable through a scoped registry. Widening it would be YAGNI; say so in the code
  rather than leaving the next reader to wonder.
- **Durable-queue upgrade.** Jobs enqueued by an old producer would lack `scope`. The in-process queue
  holds nothing across a restart, so this is a non-issue today — but a BullMQ adapter needs a job
  version/back-compat story. Record it in ADR-0057's consequences.
- **Scope creep to refuse:** dashboard UI for `indexed`; project-scoped SSE; persisting scan status
  across restarts; MCP stdio credentials (**F-072** — the agent journey's zero-auth override stays);
  a general `DocumentSink` behavioural conformance suite; per-tenant blob keys (**F-075**).
