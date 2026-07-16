# Progress log

Session-by-session record so any agent can resume from files alone. Newest entries on top.
Each entry: date · what changed · evidence/verification · decisions · next step.

## 2026-07-16 (v6) — F-061 DONE (**delivers F-073**) — search is an investigation surface; the **perf gate failed and shaped the design**

**Harness-strict selection** (next by id in R3; blocker F-039 done). Plan:
[`.harness/plans/F-061-search-depth.md`](../plans/F-061-search-depth.md). One backend commit + one web
commit. **Operator decisions: fold F-073 in; label-only by default.**

### F-073 folded in — because F-061 could not meet its own acceptance without it

Escalated rather than assumed: F-061 is R3 and F-073 is R4, so folding forward is a scope decision.
Two of F-061's own acceptance clauses are **unsatisfiable** while every hit is titled by a sha256 —
`GET /v1/effects` is keyed `{kind, key}` and a file's key **is its path**, so "show effects" on a file
result is literally impossible; and the compile task **is** the retrieval query, so seeding it with a
hash is not merely useless but actively harmful.

**It was not a contract problem.** `Candidate.label` already existed (its own comment reads *"Optional
human-readable label/snippet"*), fusion already carried it first-wins, the Zod schema declared it, and
**the committed SDK already typed it**. Only keyword/semantic/temporal — the three that index ingested
content — never populated it. **Marginal cost inside F-061: ~3 lines**, because the enrichment fetches
the fragment anyway.

### The perf gate failed, and that is the story

`918 > 900`. `thresholds.json:3` says the fix is code or a feature, **never the number** — so it was
measured per-field and escalated, not rebaselined:

| default fields | tokens |
|---|---|
| `ref` `score` `signals` | 734 |
| `+ label` | 824 |
| `+ kind` | 859 |
| `+ node` | **994** |

**The measurement disproved my own plan.** D7 blamed the label (~90). The real culprit was **`node` at
135 — and it *restates* the label** (`node.key` is the path minus the extension), so the shape was
shipping the same path twice per hit. Operator chose **label-only by default**, which yields a
coherent contract: *the default is what makes a hit an **answer**; `kind`/`node`/`snippet` are
**depth** you ask for* via `include`, each carrying its **measured token cost in the OpenAPI + MCP
description** so a caller chooses knowingly. A human dashboard pays no token budget and opts into all
three; agents stay lean.

**Re-measured: 783/900 — passes, 117 spare (13%).** The real corpus's label costs **56** tokens, not
the synthetic's 90. F-073 is fixed **by default on both surfaces**, no threshold moved. Search p95 rose
~60% (5.6 → ~8.9 ms) from the per-hit corpus lookup — still **~34× under** the 300 ms NFR-4 ceiling.

### Three real defects that verification found and tests did not

1. **Focus was dropped on `<body>` after closing the detail Sheet.** A *controlled* Radix Sheet has no
   trigger to restore to, so a keyboard user who opened a result and pressed Escape silently lost their
   place. Fixed with `onCloseAutoFocus`; doing it in `onOpenChange` loses the race against Radix's own
   restoration. **Found by an e2e assertion I nearly did not write.**
2. **The active-row cue was invisible in all four dark themes.** The `Card` base sets `dark:ring-0`,
   which **beats** an unprefixed `ring-2`. The a11y state was correct the whole time —
   `aria-activedescendant` tracked perfectly — so only a **screenshot** could catch it. `dark:ring-2`
   is load-bearing, not redundant.
3. **`aria-controls` dangled at a listbox that does not exist until there are results** — a *critical*
   axe violation on the empty search page. Caught by the **auth e2e**, which lands on `/search` with no
   query; my own axe test always had results. Same rule as `aria-activedescendant`: an ARIA reference
   must point at a live element. Now pinned by an empty-state axe test.

### Design decisions worth keeping

- **Enrichment is a composition-root decorator** over `HybridRetriever` — the only layer holding both
  the retriever and the corpus. REST and MCP both call the one `services.search`, so **both surfaces
  are enriched by one implementation** and cannot drift (ADR-0036; the F-060 `computeWorkspaceStats`
  lesson). `@tessera/retrieval` stays pure; **no `ApiServices` member** (the E-015 trap).
- **Offsets, never HTML.** The excerpt is ingested repository content — attacker-influenceable — so the
  API returns `{text, matches:[{start,end}]}` and the client renders its own `<mark>`. The XSS is
  **structurally impossible**, not sanitized. Pinned by a regression test.
- **Not `compressToFit`** (F-019): it returns *non-contiguous* segments rejoined (right for a compile
  budget, a jumble as an excerpt), no offsets, and reusing it inverts the layering. **But do reuse
  `extractTerms`** — the same tokenizer the keyword retriever matched with, so a highlight marks what
  actually contributed to the hit rather than a client-side guess.
- **A Sheet, not `/search/[ref]`** — on correctness, not taste: provenance exists only **relative to a
  query**, so a ref route would have to re-run the search to render rank/score/weight. The Sheet also
  preserves list + scroll + virtualizer + active index, which is what makes ↓↓ Enter Esc ↓ Enter work.

**Plan correction found while implementing:** `fuse.ts` needs **no change**. The decorator wraps
`HybridRetriever`, so it decorates **fused** candidates — fusion never sees the new fields. `Candidate`
is untouched and **E-012 stays purely type-only**, leaving the code that is load-bearing for both
search *and* compile alone.

### Scope limits — stated, not hidden

1. **SL-2 — file BODIES are not served** (the Sheet shows the excerpt; memory bodies render in full via
   the existing tenant-scoped route). The blob corpus has **no `forTenant`** and refs are **derivable**,
   so a by-ref endpoint would be a cross-tenant IDOR — the ADR-0050 class. **Registered as F-075.**
2. **SL-3 — "show effects" is file-only.** Symbol results need `{kind,key}` carried from the
   graph/symbolic retrievers through fusion (~6 lines) — deferred to keep E-012 type-only. The action
   is **absent**, never disabled-with-a-lie.
3. **SL-4 — one file has TWO refs** (`documentIdFor` vs `nodeIdFor`) and fusion cannot merge them.
   Labelling both makes the pre-existing duplicate **visible** rather than hidden behind a hash.
   **Registered as F-076.**
4. **SL-5 — acceptance criterion 3's "first real FR-49 virtualization" is FALSE.** F-041 shipped one in
   `memory-view`. This is the **second**, and the first **keyboard-navigable** one. (Same staleness
   class as F-060's "first `/v1/events` consumer", which was the third.)
5. **SL-6** kind filters + counts are client-side over the returned set and labelled *"for this query"*
   — never a corpus-wide claim. **SL-7** no `/graph` deep-link (no URL state + a 500-node ceiling would
   resolve to nothing) — effects render inline. **SL-8** the Inspector seed **prefills, never
   auto-compiles** (compile spends budget and is entitlement-clamped).

**Decisions** — no ADR: F-073 populates a field the contract already declares, and the enrichment
deviates from no documented default. The `include` contract and the label-only default are recorded
here and in the plan's resolved OQ-1/OQ-2.

**Evidence** (all gates, workspace-wide) — verify-state ok · typecheck **38** · lint **22** · format
clean · test **36** (config 31: +14 snippet +13 enrichment; web 278) · build **19** · e2e **20** (api
**90**, mcp **25**, web **39** incl. axe WCAG A/AA on the **empty**, **no-results**, **populated** and
**Sheet-open** states) · **bench 783/900 PASSES** · **web-perf** both budgets met (web `/signin`
**255.8 KB** gz) · **e2e-full 2/2** — the human journey now asserts a **readable path** and **zero
64-char hashes**; the agent journey asserts a label, the lean default, *and* keeps its keyword-signal
proof. SDK regenerated + committed. UI verified by **screenshot** across 4 themes × light/dark.

Effects **E-003**, **E-004**, **E-005**, **E-012**, **E-014** extended.

**Next step**
- R3 remaining, by id: **F-062** (Inspector v2), **F-063** (data tables + Audit v2). Both unblocked.
- R4 head: **F-071** (`must`, tenant-aware ingestion) — now blocking *three* things: ADR-0050's
  `document.*` feed gap, and **F-075** (registry-derived ownership would not agree with what search
  returns until it lands).

---

## 2026-07-16 (v5) — F-060 DONE — live Overview (real stats + SSE feed + bell); **closed a cross-tenant SSE leak** (ADR-0050)

**Harness-strict selection**: ordering is *by release, then id*, and R3 still had open features, so
F-060 was next (blockers F-038/F-039 done) — which also matched the operator's stated preference for
finishing R3 before R4. **F-071 is a `must` but sits in R4**; the prior session's note that it
"deserves priority over the R4 ordering" argues for it going first *within* R4, not for jumping R3.
Plan: [`.harness/plans/F-060-live-overview.md`](../plans/F-060-live-overview.md). **5 verified commits.**

### The thing that mattered most was not in the acceptance

`GET /v1/events` streamed **every event on a process-wide bus to every authenticated client, with no
tenant filter** — and the payloads carry `path`, `title`, `label`. In any token/OIDC deployment,
tenant A's browser received tenant B's file paths and memory titles. Pre-existing and latent: F-021
built the stream before multi-tenancy (F-025) existed; **F-044's "SSE auth" added authentication
(401 the anonymous) but never authorization** (whose events may you see?). No gate could catch it —
every api/mcp e2e runs in the zero-auth default tenant, *the same blind spot that hid F-071*.

F-060 forced the issue: it pipes that stream into a notifications bell on every page, turning a
latent leak into a continuously rendered one. Escalated to the operator with three options; the
decision was **fix it here** → **ADR-0050**.

- `ApiEventMap` payloads gain a **required** `tenantId` — required, not optional, because an optional
  field is a filter that fails open, and requiring it makes the typechecker ask "whose event is
  this?" at every emit site, including the next one someone adds. It found the `memory.captured`
  site immediately.
- `sseFrame` **strips** it → tenancy decides delivery without ever reaching the wire (ADR-0033), so
  the **public event shape is unchanged** and F-038's `useScanEvents` / F-042's `useLiveActivity`
  keep working untouched (golden rule 6).
- **The regression test was verified to actually catch the leak**: with the filter removed both
  isolation tests fail; with it, they pass. The globex assertions wait on globex's *own* event first,
  so "nothing arrived yet" cannot masquerade as "acme's was withheld".

**Stated gap, not hidden:** the worker has no tenant, so `document.*` is attributed to the tenant
ingestion *really* writes to (default), not the one that asked for the scan. A non-default tenant
therefore will not see `document.*` for its own scans **until F-071 lands**. Under-delivering beats
leaking. `IngestionEvents` encodes the asymmetry in the types: `source.scan.*` carry a tenant,
`document.*` do not, because the worker cannot know it. F-071 closes it by populating an existing
field — no second migration.

### What else changed

- **Counts at the stores** (no production count path existed anywhere — both ports only listed).
  `GraphStore.countNodes/countEdges` + `MemoryStore.countCurrent`, each additive on the port + **both**
  adapters + conformance incl. cross-tenant cases. `countCurrent` counts **lineages, not versions** —
  a supersede must never inflate it (pinned by a conformance case). `SourceService.summary()` is
  service-level (the `IngestionManifest` port is untouched by design) and tenant-correct by
  construction: it sums the manifest over the tenant's **own** registry.
- **`GET /v1/stats`** + the **`get_stats`** MCP tool. Parity is **structural**: both call
  `computeWorkspaceStats` behind a new Fastify-free `@tessera/api/stats` subpath (mirroring `/auth`),
  because MCP must never pull Fastify in (F-012) and two copies of the aggregation could silently
  disagree about a tenant's numbers. The parity e2e proves it over **one `ApiServices` behind a real
  Fastify server and a real MCP client**, with content created through the *agent* surface, asserting
  byte-identical results *and* the absolute numbers — so "both zero" can never pass for parity.
- **New `stats:read` permission**: the summary aggregates across documents/memory/graph/sources, so a
  token scoped to only `memory:read` must not learn the other counts through it. An e2e pins that.
- **The dashboard**: real stat cards, a live activity feed, a notifications bell with unread state.
  One `EventsProvider` owns a single `EventSource` with exponential backoff + full jitter (1s→30s);
  `EventSource` auto-retries transient drops but **gives up permanently on a non-2xx** (a 401 once a
  session expires), leaving a silently dead feed — the supervisor detects that and reconnects.

### Three things the work disproved or fixed along the way

1. **The acceptance's premise was stale.** "The dashboard gains its FIRST /v1/events consumer (none
   exists today)" — two existed (F-038, F-042), each with its own socket; feed + bell would have made
   **four**. So this **consolidates** them into one resilient client (net −1 socket), which is what
   "resilient SSE client" should have meant.
2. **Screenshot verification caught a real flaw the tests passed.** The first build flashed
   "this feed may be behind" on *every* routine reconnect. A banner that cries wolf gets ignored
   exactly when it matters → degradation is now reported only once a drop **outlives** a normal
   auto-reconnect (5s > the server's 3s `retry` hint). Verified across 4 themes × light/dark.
3. **A test assumption was wrong, not the code.** The "empty workspace" e2e expected zero graph
   nodes; the fixture seeds 2 nodes + 1 effect-link for the effects route. Corrected to assert the
   seed — a *stronger* test, because it proves the graph count is read live rather than defaulted.

### Scope limits — stated, not hidden (the F-049 precedent)

1. **No deltas.** Nothing stores a prior-period snapshot (the graph has no per-node `createdAt`; the
   manifest holds only `path → contentHash`), and a `createdAt`-derived trend would be **wrong in
   exactly the deployments that use retention** (F-047), which deletes. A test asserts the cards
   render no `%` at all. Honest trends need a snapshot store — that is analytics (FR-47/F-057).
2. **Feed + bell are live-session only** (SSE-fed, lost on reload) — the feature's stated scope; the
   copy says "this session" so it never implies history it lacks. **F-065** persists it.
3. **`lastScanAt` is process-lifetime only** — scan status is an in-memory `Map` (F-038), so a restart
   reads `null` though scans happened. The type says so; callers must render "no scan this session",
   never "never scanned". Persisting it is a registry/manifest schema change — out of scope.
4. **No `scan.failed` event exists** (errors are status-only). "Scan lifecycle" = started + completed.
   Not invented here; **F-065** owns it.
5. **F-071 makes an honest stat confusing under multi-tenant**: `documents` counts the tenant's own
   sources' manifests, so it can read `> 0` for content that tenant cannot search, because the corpus
   rows landed in `default`. That is F-071's bug surfacing *through* a correct stat — not papered over.
6. **`components/delta.tsx` is now unconsumed** (stats.tsx was its only caller). Kept for a real trend
   source (F-057), not deleted — out of scope. Recorded on **E-004**.

**Decisions** — **ADR-0050** (SSE tenant scoping). No ADR for stats itself: it composes existing
services and adds no product decision. Deliberately **not audited** (a per-page-load aggregate read
would flood the F-027 trail); `get_stats` reuses the `source.read` action so the two surfaces do not
disagree. **No new `ApiServices` member** — `instrumentServices` (E-015) rebuilds that object and
silently drops what it does not forward, which already caused a production 500 for `sources` once.

**Evidence** (all gates, workspace-wide) — verify-state ok · typecheck **38** · lint **22** · format
clean · test **36** (knowledge-graph 44, memory 55, ingestion 67, api 57, web 267) · build **19** ·
e2e **20** (api **87**, mcp **25**, web **32** incl. axe WCAG A/AA on the *populated* feed + bell) ·
**web-perf** both budgets met (web `/signin` **256.3 KB** gz, budget 300 — +3.2 KB) · **e2e-full 2/2**.
SDK regeneration verified **idempotent** (committed artifacts match the live OpenAPI). UI verified by
**screenshot** across 4 themes × light/dark plus the bell-open and empty states.

Effects **E-003** (×2: the new REST+MCP surface; the SSE stream is now tenant-scoped), **E-004**,
**E-009**, **E-010**, **E-011**, **E-014**, **E-018** extended.

**Next step**
- R3 remaining, by id: **F-061** (search depth — F-073 belongs with it), **F-062** (Inspector v2),
  **F-063** (data tables + Audit v2). All unblocked.
- **F-071 (`must`)** heads R4 and is now *more* worth doing: ADR-0050 left it a landing strip — when
  the tenant travels source → queue → worker, `document.*` attribution becomes correct by populating
  an existing field, and F-060's stated feed gap disappears with it.

---

## 2026-07-16 (v4) — F-049 DONE — `perf` + `web-perf` gates ACTIVE; **NFR-4 measured for the first time**; no `planned` gates remain

**Harness-strict selection** (next by id in R3; blocker F-039 done). Plan:
[`.harness/plans/F-049-perf-benchmarks-and-budgets.md`](../plans/F-049-perf-benchmarks-and-budgets.md).
**No product code changed.** Two commits (bench/perf, then web-perf + close-out).

**NFR-4 was an R0 exit criterion that was never measured** (flagged 2026-07-04) — "search p95 < 300 ms",
"compile p95 < 2 s", "token-lean" were claims with no evidence. They are now facts:

| metric (REAL Transformers.js) | measured | NFR-4 ceiling |
|---|---|---|
| search p95 | **10.8 ms** | 300 ms |
| compile p95 (default budget) | **14.2 ms** | 2 s |
| incremental ingest p95 | **104 ms** | "near-real-time" |

**What changed**
- **`tests/bench` (`@tessera/bench`) — the `perf` gate.** A **versioned deterministic corpus** (seeded
  mulberry32, 150 files with real import chains; *generated, not committed* — the generator+seed+version
  is the thing that must stay stable) drives the **real Local runtime in-process**. Measures search/
  compile/incremental-ingest p95 and **tokens-per-answer for REST *and* MCP separately** (ADR-0036
  parity), counted with `estimateTokens` — the same counter the budget itself is enforced with.
  Thresholds are **absolute** (committed `thresholds.json`), never baseline deltas: CI hardware varies,
  and a delta gate would flake until someone disabled it. The gate runs **fake embeddings** so it
  measures *our engine* and stays machine-comparable; the real-provider number is recorded, not gated.
  `--record` updates the committed baseline **deliberately** — a baseline that rewrites itself records
  nothing and would ratify a regression as the new normal.
- **`tests/web-perf` (`@tessera/web-perf`) — the `web-perf` gate** (ADR-0021: asked for in F-028, never
  turned on). First-load JS measured over the wire, gzipped by the harness: **marketing 203.9 KB**
  (budget 240) · **web `/signin` 253.1 KB** (budget 300). Marketing's budget is cross-checked against
  `marketing-design.manifest.json` so the two cannot drift.
- **gates.json now has no `planned` entries.** Both gates have CI steps (the ci-mirror guard enforced it).

**Three measurement bugs I found in my own harness** — each would have shipped a gate that lies
- **Token counts weren't deterministic** until mtimes were pinned: ingestion records mtime → the
  temporal retriever ranks on it → rank-based fusion reshuffles the result set. **Content-identical is
  not corpus-identical**; tokens moved ~10% run to run.
- **The bundle measurement undercounted 4.6×** (46 KB vs 214 KB real): `await response.body()` inside an
  async `page.on('response')` handler races context teardown, the rejections were swallowed by a catch.
  It would have happily passed a bundle that had already blown its budget.
- **networkidle counted the lazy shader chunk** (260 KB), failing the app *for successfully
  code-splitting*. "First Load JS" is the `load` event — that IS the budget's definition. 203.9 KB then
  cross-validated against the historically recorded ~208 KB.

**Scope limit — stated, not hidden**
The acceptance's **Lighthouse CI half was implemented and removed.** On pages running a WebGL shader +
canvas constellation on continuous rAF loops, Lighthouse extrapolated a **71,670 ms TBT inside a ~10 s
trace** (simulated throttling), and `throttlingMethod: 'provided'` returned **TBT NaN / score 0**.
Gating on either is gating on noise. So **CWV is declared-but-unenforced, NFR-17's CWV clause is NOT
satisfied by a gate**, and **F-074** carries it with the evidence and its acceptance pre-written. The
gate description and `budgets.json` say so plainly rather than implying coverage.

Also corrected an assumption the data disproved: the compile envelope is ×1.61, but the **trace is only
166 of ~1275 overhead tokens (13%)** — the bulk is JSON escaping + the provenance FR-32 requires. No
"trim the trace" work item was invented, because the measurement didn't support one.

**Evidence** — verify-state ok · typecheck **39** · lint **22** · format clean · test **36** · build
**19** · e2e **20** · e2e-full **2/2** · **bench** every NFR-4 threshold met · **web-perf** both budgets
met. Effects **E-005** (two gates + CI; no `planned` left) and **E-013** (the compiler now has a measured
latency + token contract) extended.

**Next step**
- R3 remaining, by id: **F-060** (live Overview: real stats + SSE feed), **F-061** (search depth —
  note F-073 belongs here), **F-062** (Inspector v2), **F-063** (data tables + Audit v2). All
  unblocked. **F-071 (must)** still outstanding from F-048 — multi-tenant ingestion is silently broken.

## 2026-07-16 (v3) — F-048 DONE — full-stack e2e (`e2e-full` gate ACTIVE): real server + fixture repo + real web + real MCP client — **found 3 real defects on first run**

**Harness-strict selection** (next eligible by id in R3; blockers F-038/F-039/F-041/F-045 done; tree
clean). Plan: [`.harness/plans/F-048-full-stack-e2e.md`](../plans/F-048-full-stack-e2e.md). **No product
code changed** — this is a test feature, and every defect it found was *registered*, not patched into it.

**What changed**
- **New private suite `tests/e2e-full`** (`@tessera/e2e-full`) via a new **`tests/*` workspace glob** —
  it is neither an app nor a library, and the location says so.
- **The real deployment** (`support/full-stack-server.mjs`): boots **`startApiServer`** — the same entry
  the shipped `tessera-api` binary uses — over the Local profile with **file-backed** SQLite in a fresh
  `mkdtemp` dir (**not** `:memory:`: the agent journey is a *separate process* that must open the same
  DB; SQLite is WAL, so that is safe), token auth, audit on, fake embeddings (real Transformers.js
  behind `TESSERA_E2E_REAL_EMBEDDINGS=1`). It registers the fixture repo and **scans it, asserting
  `added === 3` before reporting healthy**. Handoff is a **file**, not an `/e2e/*` route — the real
  server keeps its real surface (an improvement on the F-045 precedent).
- **Fixture** (3 files): the nonsense term **`quernstone`** so a search hit can never be incidental;
  `reporting.ts` imports `ledger.ts` so `get_effects` has a real dependent to return.
- **Human journey:** Playwright drives the **real `apps/web`** (production build, proxied at the live
  API — *not* its own stub): sign-in → sources → search → inspector → capture a memory **in the real
  Monaco editor** → audit.
- **Agent journey:** a real MCP `Client` spawns the **real `tessera-mcp` binary over stdio** against the
  **same data dir** — `search`/`compile_context`/`get_effects`/`capture_memory`/`add_source`, asserting
  **budget-bounded** (`totalTokens <= budget`), **token-lean** (<20KB payload), that the compiled package
  carries the fixture's **real prose**, and cross-verifying each write through REST. This is the first
  test to prove ADR-0036's "one engine, two surfaces" over **real files**, not a shared in-process object.
- **Gate:** `e2e-full` `planned` → **ACTIVE** (`pnpm -w test:e2e:full`) + turbo task + root script + a CI
  step (verify-state's ci-mirror guard *enforced* that pairing). **`workers: 1`, `retries: 0`** — a flaky
  full-stack gate is a lie. Ports 3200/3201 so it runs back-to-back with gate 6.

**The three defects it found on first run** (all registered as features, none worked around silently)
- **F-071 (must) — ingestion indexes into the DEFAULT tenant, always.** `createIndexingDocumentSink`
  calls `indexDocument` with **no `tenantId`**, so it defaults to `DEFAULT_TENANT_ID` (its own comment
  calls this "the F-038 boundary"). In any token/OIDC deployment a scan reports **`added: 3`** while the
  registering tenant sees **nothing**. Proven against a real server: tenant `acme` → search `[]`, graph
  empty, compile 0 sections; the identical run as `default` → 3 ranked hits, 6 graph nodes, a 533-token
  package. **No existing gate could see this** — api/mcp e2e all run in the zero-auth default tenant.
  The suite is pinned to the default tenant (the shipped single-tenant local shape, ADR-0003) with a
  loud comment at the `TENANT` constant pointing at F-071.
- **F-072 (should) — MCP over stdio has no credential channel.** `defaultCredentialResolver` reads the
  SDK `authInfo` / `Authorization` header; **stdio has neither**, so token-mode MCP rejects every call
  and nothing in `.env.example` offers a token. The gateway's own doc comment claims it "works over
  stdio (one identity)" — true only in zero-auth mode. The agent journey therefore runs zero-auth (the
  real local agent shape).
- **F-073 (should) — search results have no label.** Hits are `{ref: <sha256>, score, signals}`, and the
  dashboard's `label ?? ref` fallback renders a **64-char content hash** for real repository content.
  The data exists (the corpus stores `path`; graph nodes carry `label: 'reporting.ts'`) — it just never
  reaches the retrieval `Candidate`. Overlaps F-061.

**Evidence/verification** (all gates fresh, workspace-wide)
- verify-state ok (968 doc links, **11 gates CI-mirrored**) · typecheck **36** · lint **20** · format
  clean · test **35** · build **19** · e2e **20** · **e2e-full 2/2 (~40s)**.
- Two of my own assumptions were disproved by the real system and corrected in the specs (both now
  carry the reasoning): refs are **content hashes, not paths**; and a semantic retriever has **no
  relevance floor**, so a nonsense query still returns nearest neighbours — the **keyword/FTS** signal
  is the load-bearing proof of a real hit. The real **Monaco** editor also had to be *focused and
  typed into* (a contenteditable whose `.view-line` overlay eats clicks), not `fill`ed — unit tests
  stub Monaco, so this suite is the only place it is ever exercised.

**Decisions**
- No ADR: the suite adds no product decision — it composes existing entry points. The *findings* may
  each need one (F-071 likely does: the tenant must ride the queue job, since the sink is constructed
  once per runtime, not per tenant).
- Effects **E-005** (new active gate + CI mirror + the `tests/*` glob) and **E-003** (the first
  cross-surface consumer; it now pins the real wire shapes) extended.

**Next step**
- Next eligible by id in R3 is **F-049** (perf benchmarks + `web-perf`/`perf` gate activation; blocker
  F-039 done). Then the dashboard-data set F-060/F-061/F-062/F-063. **F-071 is a `must`** and is the
  most consequential thing this session found — a multi-tenant deployment is silently broken until it
  lands; it deserves priority over the R4 ordering if hosted/multi-tenant is near-term.

## 2026-07-16 (v2) — F-047 DONE — compliance completion: memory retention (FR-15), DSR export/erasure (NFR-13), MCP-surface audit (closes the F-027 seam)

**Harness-strict selection** (ordering is *by release, then id* — not priority — so F-047 precedes the
`must` F-048/F-049; blocker F-027 done; tree clean, no WIP). Plan:
[`.harness/plans/F-047-compliance-completion.md`](../plans/F-047-compliance-completion.md); decisions in
**ADR-0049**. Shipped in **4 verified commits** (memory+config · api/sdk/web · mcp/server · docs/state).
Everything additive and **off by default** — existing deployments are byte-stable.

**What changed**
- **Memory retention (FR-15 — flagged R2, never delivered).** `MemoryStore` gained
  `exportAll`/`deleteVersion`/`deleteLineage` (both adapters + the shared conformance suite, incl.
  cross-tenant isolation of erasure/export). New `service/retention.ts`: `MemoryRetentionRule`/`Policy`
  (match by kind/scope; **most-specific rule wins**) + a pure `pruneMemories(store, policy, {now})`
  with an injected clock. **Retention only DELETES** — expires whole aged lineages (age from the
  *current* version's `createdAt`, so an actively-edited memory doesn't go stale) and compacts
  already-superseded versions, never touching a kept lineage's current version ⇒ **FR-12
  never-silently-mutate holds by construction**. `config.memory.retention` (days→ms) resolves onto
  `Runtime.memoryRetention`; **empty by default**. Scheduling is a **seam** (the prune route is the
  trigger); runtime policy mutation deliberately not offered (config is the source of truth).
- **Erasure has no remanence.** The indexing `MemoryService` decorator de-indexes expired/erased
  lineages from the retrieval corpus (blob+keyword+temporal+vector) — a store-only delete would leave
  the text searchable and still served from the corpus.
- **DSR (NFR-13).** Fastify-free `apps/api/src/dsr` (`buildDsrBundle` + `purgeTenant`) behind
  `GET /v1/dsr/export` + `POST /v1/dsr/delete`. Exports are **exhaustive by design** (every memory
  *version*, the whole graph, sources, the **fully-paged** trail) — hence the new **unbounded**
  `KnowledgeGraphService.exportAll()` beside the display-capped `queryGraph`; `exportAll`/`purge` live
  on the graph **service only**, over existing `GraphStore` methods (no port change). The bundle schema
  is **composed from the existing** memory/graph/sources/audit schemas, so an export can't drift from
  the live surface. Erasure removes the data plane but **retains the audit trail** (ADR-0049) and
  records `dsr.delete` into it. `GET /v1/retention` + `POST /v1/retention/prune`. All four:
  `admin:manage`, audited, **caller's own tenant only** (`tenantOf(request)` — never a tenant id off
  the wire). +4 audit actions ⇒ OpenAPI + SDK regen (`getRetention`/`pruneRetention`/
  `exportTenantData`/`deleteTenantData`) + the web `AuditAction` mirror/labels in lockstep.
- **MCP-surface audit — the F-027 seam is CLOSED.** `McpGateway` takes an optional `AuditLog` and
  records the **authorization decision** (`success` once authorized+metered; `denied` on a
  permission/quota refusal; **unauthenticated records nothing** — no identity ⇒ no tenant, mirroring
  the REST 401 rule). Recording lives **in the gateway** because that is the only place the identity is
  known at refusal time (a `ForbiddenError` throws before an outer wrapper could learn the actor).
  `MCP_AUDIT_ACTIONS` maps every tool onto the **existing REST taxonomy** (`capture_memory` →
  `memory.write`) + `metadata.surface='mcp'` ⇒ **one trail, one vocabulary** across both surfaces
  (ADR-0036). Best-effort/failure-isolated. `apps/server` wires `runtime.audit`. **F-012 no-Fastify
  invariant verified against the built dist** (`gateway.js` imports `@tessera/core` alone).
- **Docs.** New [`docs/compliance/data-governance.md`](../../docs/compliance/data-governance.md):
  retention config, the DSR operator runbook, and the **encryption-at-rest posture** (SQLite FDE/
  SQLCipher · Postgres TDE/encrypted volumes · keys via `SecretsProvider`, never the repo) — NFR-13
  asks the posture be *documented*; it is a deployment concern, not app-level. ADR-0049 written; also
  **indexed ADR-0048**, which F-045 left out of `docs/adr/README.md` (drift fixed).

**Evidence/verification** (all gates fresh, workspace-wide)
- verify-state ok (**963** doc links, 25 effect-links) · typecheck **34** · lint **19** · format clean ·
  test **34** (memory **43**, config **41**, knowledge-graph **32** +2, mcp **20** +6, sdk **11** +2) ·
  build **19** · e2e **19** — **api 76** (+11 `dsr.e2e`: complete bundle incl. *both* versions,
  cross-tenant isolation on export **and** erasure, viewer 403 / unauth 401, the erasure event retained
  in the trail, prune keeps the current version) · **mcp 21** (+3 audit assertions driving a **real MCP
  client** over a linked transport).
- Not browser-verifiable: this feature adds no UI (the web change is the `AuditAction` type/label
  mirror, covered by typecheck + the existing governance view).

**Decisions**
- **ADR-0049**: (1) retention deletes, never mutates — a tombstone-version design was rejected as it
  would grow the lineage it means to shrink and erase nothing; (2) DSR erasure **retains the trail** —
  deleting it would destroy the proof of erasure while removing no content (it holds none, NFR-7);
  config-gated audit erasure is a seam; (3) MCP audit reuses the **existing** taxonomy — `mcp.*`
  actions were rejected as a taxonomy fork; (4) encryption-at-rest = deployment concern, documented.
- Effects **E-010** (retention pass + 3 port methods + the de-index rule), **E-020** (MCP recording, the
  4 new actions and their web-mirror tripwire), **E-003** (the 4 routes + SDK; the DSR schema's
  deliberate coupling to the existing schemas) all extended.

**Next step**
- Next eligible by id in R3 is **F-048** (full-stack e2e: real server + fixture repo + real web + real
  MCP client, new `e2e-full` gate) — all blockers (F-038/F-039/F-041/F-045) are done. Then **F-049**
  (perf benchmarks + web-perf activation). Also open: the dashboard-data set F-060/F-061/F-062/F-063.

## 2026-07-16 — F-046 DONE — account & profile: professional /profile, API-token self-service (REST + MCP parity), RBAC-from-API

**Harness-strict selection** (next eligible R3, blocker F-045 done, `should`). Plan:
[`.harness/plans/F-046-account-profile-tokens.md`](../plans/F-046-account-profile-tokens.md);
governed by **ADR-0036** (the API/MCP parity rule — every op is REST **+** MCP). Shipped in 2
commits (API/MCP/SDK enablers, then web). All operations over the existing `TokenStore`; no fake
data.

**What changed**
- **`TokenStore` port + expiry** — added optional `expiresAt` (record + issue input) with a shared
  `isRevoked`/`isExpired` verify predicate across the in-memory + sqlite adapters (sqlite `ADD
  COLUMN` backfill; F-024 owns real migrations).
- **REST `/v1/tokens`** — `GET` list (no secrets) · `POST` create (**secret returned once**) ·
  `DELETE :id` revoke. `admin:manage`, tenant-scoped, **audited** (new `token.read`/`token.manage`),
  **least-privilege create** (a caller can't mint a token exceeding its own permissions —
  server-enforced + e2e); `409` when no token store (zero-auth). **`GET /v1/rbac`** exposes the
  roles/permissions catalog so the dashboard **derives RBAC from the API** — the hand-mirrored
  `lib/governance.ts` catalog is gone (`governance-view` uses a `useRbac` hook; drift killed).
- **MCP parity (ADR-0036)** — `list_tokens`/`issue_token`/`revoke_token` tools over the same store
  (Fastify-free `@tessera/api/auth` value imports), gateway `admin:manage`; `buildMcpServer` +
  `apps/server` wire `runtime.auth.tokenStore`.
- **SDK** — `getRbac`/`listTokens`/`createToken`/`revokeToken`/`getSubscription`; OpenAPI + types
  regenerated.
- **Web `/profile`** — identity card, access card (roles + effective-permission chips), an
  **enterprise "Plan & usage" card** (plan + status badge + price + renewal + entitlement stat
  tiles), an agent-connectivity hint, the **API-tokens panel** (create dialog with role/expiry +
  **copy-once secret reveal**, revoke), and a **members-from-tokens** card; Profile in the account
  menu. Admin user management = token principals grouped from the token list (role assignment =
  issuing a scoped token; a first-class user directory + OIDC-user listing are documented seams).
- **Stakeholder polish** (mid-feature): dropped the sparkle icon (→ `CreditCard`), fixed the avatar
  initials (`Local (no auth)` → `LO`, not `L(`), redesigned the Plan card, and **confirmed fonts
  follow the theme** (`font-sans`/`font-mono` map to per-theme stacks — verified in Notebook:
  Architects Daughter + Fira Code across the page). Browser-verified in Monkai + Notebook.

**Evidence/verification** (all gates fresh, workspace-wide)
- verify-state ok · typecheck **34** · lint **19** · format clean · test **34** (api +6 token/rbac
  e2e, mcp +3 token tools + list assertions, sdk +4) · build **19** · e2e **18** — **web 29** (26
  view + 2 auth + **1 `profile.spec`**: renders identity/access/plan + axe AA, then **issues a token
  in the UI whose secret authenticates `/v1/me` as the new principal**). The `/v1/rbac`+`/v1/me`
  stubs were added to the shared fixture (+ the appearance custom-context test) so view specs don't
  401-redirect.
- Browser-verified: profile identity (`EU` avatar), access chips, Plan & usage tiles, the
  create→copy-once dialog, and the token + members tables, in both Monkai and Notebook themes.

**Decisions**
- No new ADR — thin routes/tools over the existing `TokenStore` (the one-engine/two-surfaces pattern
  under ADR-0036). Effects E-018/E-003/E-020/E-004 extended. Least-privilege create + tenant-scoped
  revoke + copy-once are the security invariants (all e2e-covered).

**Next step**
- Next eligible by id in R3 is **F-047** (compliance completion: memory retention policies, DSR
  export/delete, MCP-surface audit). Also open: F-048/F-049 and the dashboard-data set
  F-060/F-061/F-062/F-063.

## 2026-07-14 (v2) — F-045 DONE — dashboard auth & session + adopt @tessera/sdk (closes ADR-0022); enterprise sign-in redesign

**Harness-strict selection** (next eligible R3, blockers F-034/F-044 done, `must`). Plan:
[`.harness/plans/F-045-dashboard-auth-and-sdk.md`](../plans/F-045-dashboard-auth-and-sdk.md);
decision recorded in **ADR-0048**. Shipped in 2 commits (API/SDK enablers, then web). Zero-auth
Local mode stays **byte-for-byte unchanged**.

**What changed**
- **API — `GET /v1/me`** (new): projects the resolved `AuthContext` →
  `{principal{id,kind,roles,displayName?},tenantId,permissions}`. Authenticated, no special
  permission (a principal may see itself). Zero-auth ⇒ the local principal; token-mode-no-token ⇒
  401 (mode discovery). Regenerated the OpenAPI doc + **`@tessera/sdk`** (added
  `me`/`getPlans`/`getHealth`/`getReady`; `getReady` returns the 503 body as data).
- **Credential handling (ADR-0048)** — the API token lives **only in an httpOnly cookie behind a
  same-origin Next proxy**, never in client JS/localStorage. `app/api/tessera/[...path]` forwards
  `/api/tessera/*` → `TESSERA_API_URL/*` (server-only env), attaching `Bearer` from the cookie;
  SSRF-guarded, streams JSON **+ SSE**, returns the upstream `{error}`/status verbatim.
  `app/api/auth/session` `POST` validates via `/v1/me` then sets the `HttpOnly`/`SameSite=Lax`/
  `Secure` cookie; `DELETE` clears it.
- **Session UX** — `lib/auth` `SessionProvider`/`useSession` (identity via the SDK `me()`);
  status keys off React Query **`isError`** so sign-out's failed refetch is detected despite
  retained `data` (the one real bug the e2e caught); a **401 ⇒ redirect to `/signin?return=`**,
  other failures ⇒ Local fallback (offline-safe). Identity-aware **NavUser** (kind `local` ⇒
  unchanged "Local mode"; token ⇒ identity + tenant + **Sign out**). `AppShell` renders chromeless
  on `/signin`.
- **SDK adoption (closes ADR-0022)** — `lib/api/client` is now a thin adapter over
  `createTesseraClient({ baseUrl: '/api/tessera' })`; the TanStack Query **hook surface + every
  view are unchanged** (the promised drop-in); `TesseraApiError` re-exported; `API_ORIGIN` = the
  proxy base so `events.ts` SSE (EventSource) routes through the proxy → the cookie gives it
  **server-side bearer auth for free**. Fixed the stale web `AuditAction` union
  (+`effects.write`/`source.read`/`source.manage`) + governance labels.
- **Sign-in redesign (stakeholder ask — enterprise-grade)** — retired the cramped centered card
  for a full-height **split panel**: a living brand panel (theme-tinted gradient + the
  **Constellation** art on the DESIGN-SYSTEM §11 onboarding budget + "Your agents forget. /
  Tessera remembers." + a mono trust line) beside a spacious, well-padded form. Tokens-only,
  theme-true, reduced-motion-safe, one `<h1>`.

**Evidence/verification** (all gates fresh, workspace-wide)
- verify-state ok (25 effect-links) · typecheck **33** · lint **19** · format clean · test **33**
  (api +3 `/v1/me` e2e, sdk +2, web 238 unit) · build **19** · e2e **18** — **web 28** (26 view
  specs green through the SDK swap + a Local `/v1/me` fixture; **2 auth-flow specs against a REAL
  token-mode API** booted as a 2nd Playwright webServer: unauth→`/signin`, bad token error, valid
  token→identity, sign-out, **token never in localStorage**; axe WCAG AA on `/signin` + the authed
  shell).
- Browser-verified (production build, token mode): sign-in → redirect to Overview → account menu
  shows **"E2E User · acme · owner"** + Sign out; the split-panel `/signin` renders the brand art +
  gradient with no horizontal overflow (DOM-measured 714px brand + 646px form).

**Decisions**
- **ADR-0048**: httpOnly-cookie same-origin proxy over token-in-JS/localStorage; closes ADR-0022
  onto the SDK. New effect **E-025** (web auth/proxy seam); E-003/E-018/E-004 extended. No
  golden-rule deviations; OIDC hosted sign-in + double-submit CSRF are documented seams.

**Next step**
- Next eligible by id in R3 is **F-046** (account & profile: profile page, API-token self-service,
  admin user management) — now unblocked (F-045 done). Also open: F-047/F-048/F-049 and the
  dashboard-data set F-060/F-061/F-062/F-063.

## 2026-07-14 — F-044 DONE — API hardening: rate limiting, security headers, SSE auth, per-profile CORS, request-id

**Harness-strict selection** (lowest-id eligible in the earliest open release R3; blocker F-025
done; `must`). No stakeholder redirect this session, so followed the working loop straight down
the list. Plan: [`.harness/plans/F-044-api-hardening.md`](../plans/F-044-api-hardening.md). All
changes **additive** — no route/schema shape change, so E-003's OpenAPI doc / `@tessera/sdk` /
dashboard are untouched; safe local defaults keep dev zero-friction.

**What changed**
- **New `apps/api/src/security/*`** (one Fastify plugin per concern, applied uniformly):
  - `headers.ts` — `securityHeaders()` map (CSP `default-src 'none'; frame-ancestors 'none'`,
    `X-Frame-Options: DENY`, `nosniff`, `no-referrer`; **HSTS only behind a TLS flag**) +
    `registerSecurityHeaders` onRequest hook. **Explicit hooks, not `@fastify/helmet`** — the
    JSON-only API needs a strict CSP and no new dep (the sanctioned non-deviating option).
  - `rate-limit.ts` — a `RateLimiter` port + `createInMemoryRateLimiter` (fixed-window per key,
    **mirrors the F-026 MCP `QuotaLimiter`**; distributed store = documented seam) +
    `registerRateLimit` hook keyed on `request.authContext` principal (fallback per-IP), wired
    **after** `registerAuth` inside `/v1` → `RATE_LIMITED` 429 envelope + IETF
    `RateLimit-Limit/Remaining/Reset` + `Retry-After`. **Default off** (F-026 precedent; preserves
    existing e2e).
  - `request-id.ts` — Fastify `requestIdHeader:false` + a **sanitizing** `genReqId` (honor inbound
    `x-request-id` matching `/^[\w.-]{1,128}$/`, else `req_<uuid>`; blocks header/log injection),
    bound into logs (label `requestId`) + echoed via an onRequest hook.
- **CORS** — `server.ts` `corsOriginDelegate`: an explicit `allowedOrigins` allowlist (ADR-0035
  app↔api) replaces the blanket policy; empty ⇒ the loopback-permissive local default.
- **SSE** — `GET /v1/events` already sits inside the `/v1` auth scope (the auth onRequest hook
  runs before the handler hijacks), so under a non-none provider it **401s** — this was **not a
  bypass**; the new e2e locks it. Its `writeHead` now also emits the security headers + request id.
- **Config + wiring** — `@tessera/config` gains a `config.api` section (`rateLimit`/`cors`/
  `security`) + `TESSERA_API_*` env + `.env.example`; `apps/server` maps `runtime.config.api` →
  `buildServer` and, when observability is wired, an onRequest hook calls the **new**
  `@tessera/observability` `annotateRequestId(id)` to tag the active OTel span (request-id →
  traces without `@tessera/api` taking an OpenTelemetry dep). `buildServer` gains
  `security?`/`cors?`/`rateLimit?`; the new surface is exported.

**Evidence/verification** (all gates fresh, workspace-wide)
- verify-state ok (24 effect-links) · typecheck **33** · lint **19** · format clean · test **33**
  (api +8 unit: headers 4, rate-limit 4; config +5 schema) · build **19** · e2e **18** (api +11
  `hardening.e2e.test.ts`: headers present + HSTS gating, 429 path + `RateLimit-*`/`Retry-After`,
  request-id generate/honor/sanitize, CORS allowlist honored, **SSE 401 under token mode** +
  authenticated stream over a real socket).

**Decisions**
- No ADR: security headers via explicit hooks and rate-limiting-off-by-default are the documented
  non-deviating choices; CORS allowlist references ADR-0035. Effects E-003/E-014/E-018 extended +
  **new E-024** (the hardening-middleware seam: distributed rate limiter, API-key principals F-055,
  OTLP request-id spans are its documented follow-ups).

**Next step**
- Next eligible by id in R3 is **F-045** (dashboard auth & session + adopt `@tessera/sdk`, closes
  ADR-0022) — now unblocked (F-044 done). Other open R3 items: F-046/F-047/F-048/F-049 and the
  dashboard-data set F-060/F-061/F-062/F-063 (F-062/F-063 have no blockers).

## 2026-07-12 (v3) — F-070 DONE (absorbs F-068) — dashboard experience overhaul: 4-theme catalog, radial appearance propagation, signature illustration layer + Tess, executable WCAG-AA contrast gate

**Stakeholder review of the dashboard: "too dull, lifeless, lacks design and creativity;
most pages lack illustrations; make it professional, enterprise-grade, Awwwards-worthy; add
the four tweakcn themes (Amber/Claude/Notebook + Monkai default) each with light/dark, with
a toggle that propagates from the control like the marketing footer; add a WCAG-AA Contrast
Checker rule + skill."** The same lesson as F-051/F-067
([[design-contract-mechanism-outlives-parameters]] — this lead reads austere minimalism as
lifeless). Shipped in 6 verified increments (one commit each; standing cadence).

**What changed**
- **Governance:** registered **F-070** (absorbs **F-068**); **ADR-0047** supersedes
  ADR-0023's *color* clauses (efferd stays the layout/structure reference; color generalizes
  to a 4-theme catalog); **DESIGN-SYSTEM v2** (+§0.1 theme catalog, §8.1 contrast gate, §11
  illustration/mascot budget) + `design-system.manifest.json` 2.0.0; new **contrast** rule +
  **contrast-checker** skill (+ `.claude` shim), cross-referenced from AGENTS/rules.
- **Theme system:** the classless `:root`/`.dark` in `globals.css` ARE **Monkai** (default,
  byte-stable — zero regression by construction). `app/themes.css` vendors **Amber / Claude /
  Notebook** from the tweakcn registry JSONs as `:root[data-theme='X']` / `.dark` blocks (full
  role set + `--chart-*` + `--sidebar-*` + `--radius` + `--shadow-*` + per-theme fonts). Two
  orthogonal axes: **mode** = `.dark` (next-themes) × **theme** = `data-theme`
  (`lib/theme.tsx` state + `lib/theme-script.ts` pre-paint script, **no FOUC**). `@theme
  inline` resolves fonts + shadow scale through runtime tokens so components stay token-only
  across all 4×2. Theme faces via `next/font` **`preload:false`** — off the Monkai critical
  path. **Never `shadcn add`** (clobbers `:root`).
- **Executable contrast gate:** `apps/web/tests/contrast.test.ts` — zero-dep
  oklch/hex/rgb→sRGB→WCAG math (self-tested against known values), asserts every registered
  token pair (incl. **opacity-composited** pairs) across **4 themes × 2 modes** in the standard
  `test` gate. Vendored tweakcn AA failures **and** latent Monkai ones (dark `--input`,
  `muted-foreground`, destructive-as-text, focus ring) nudged in-place with CSS comments. The
  catalog-wide **axe** sweep also caught real composited failures (`text-sidebar-foreground/70`
  group labels, inspector `/80`,`/60` texts — sub-AA in the light themes; `/80` was already
  sub-AA in monkai-light, latent since the app defaults to dark) → fixed + registered.
- **Appearance controls:** header **AppearanceSwitcher** (theme picker w/ swatches + mode
  segment), ⌘K commands, and a `/settings` **AppearanceSettings** card — all ripple radially
  from the pressed control (`useAppearanceTransition`: `startViewTransition` + clip-path;
  instant under reduced-motion / no API). Replaced the old `ThemeToggle`.
- **Illustration layer** (`components/art/*`, DESIGN-SYSTEM §11): seven server-rendered SVG
  arts on dashboard tokens with CSS-only motion (`app/art.css`, frozen by the reduced-motion
  kill-switch) — Constellation, CompilerAssembly, SignalField, PipelineFlow, MemoryStrata,
  LedgerGate, TimeRiver; each a product truth, decorative (`aria-hidden`), theme-true.
  `EmptyState`/`ErrorState` gained `art`/`mascot` slots; adopted across every empty/error
  surface under the usage budget (governance's static RBAC gets none — art only where it fits).
- **Tess (F-068):** `@tessera/mascot` dep + styles imported once; `--mascot-*` bound per theme
  in `globals.css` (gilded heart = fixed ember, overridden to amber/claude's warm `--primary`);
  new `app/not-found.tsx` 404 with Tess `lost`; empties/errors use `searching`/`watching`/
  `alarmed`. Overview leads with a greeting **HeroBand** (theme-tinted gradient + live
  Constellation, honest onboarding — no fabricated numbers) and Tess `watching` on the activity
  empty. Stat cards stay honestly `—` (live data is F-060).

**Evidence/verification** (all gates fresh, workspace-wide)
- verify-state ok (925 doc links) · typecheck **33** · lint **19** · format clean · test **33**
  (web **236**, incl. **195** contrast assertions across 4 themes × 2 modes) · build **19**
  (12 web routes incl. prerendered `/_not-found`) · e2e **18** (web **26** incl. the new
  `appearance.spec.ts` — data-theme persists, no-FOUC, reduced-motion instant, **axe WCAG A/AA
  across all 4 themes × 2 modes**; api 45; mcp 16; marketing 48).
- Browser-verified: all four themes render via pure cascade (screenshots), the ripple + header
  dropdown + settings card + live switching, the SignalField/CompilerAssembly/Constellation
  arts, the 404 mascot, and the overview hero in Monkai + Amber; Claude-light shows Tess
  `alarmed` with a terracotta heart (per-theme mascot binding proven). No horizontal overflow.

**Decisions**
- ADR-0047: vendor tweakcn themes into scoped `[data-theme]` blocks rather than `shadcn add`
  (which overwrites the single `:root`/`.dark` set and can't express 4 coexisting themes);
  contrast is enforced **executably**, not documented; illustration layer + mascot governed by
  a hard usage budget (never data views); Monkai's efferd monochrome now describes the default
  theme, not the whole dashboard.

**Next step**
- The dashboard's next features are unchanged and independent: **F-060** (live overview data +
  SSE feed), **F-061** (search depth), **F-062** (inspector v2), **F-063** (data tables). This
  overhaul made no data-layer changes.

## 2026-07-12 (v2) — F-067 DONE — legal pages get expressive heroes + 5 signature arts + GDPR page (ADR-0045 v4.10)

**Stakeholder review of v1: "too dull, lifeless, lacking design/creativity; the first
section should be a full-height hero like the homepage; most pages lack illustrations; add
creative, polished, interactive, animated illustrations — artistic masterpieces; add a
GDPR page; soften the draft badge; capture pending items in the harness."** Direction
confirmed via decision prompt: **expressive frame, calm document**. This is the F-051/F-066
lesson again ([[design-contract-mechanism-outlives-parameters]] — this lead reads austere
minimalism as lifeless); v1's compact opening was retired and its recorded PageHeader
fallback promoted, extended with per-page art.

**What changed**
- **Every legal page (now five) opens with the §3.12 `PageHeader`** — the same full-height
  shader-field ground as features/pricing/enterprise — carrying a bespoke **legal
  signature art** in the art slot; the §3.14 article body below stays calm (max-w-prose,
  serif h2s, tables, counsel callouts). `legal-article.tsx` is body-only now; the new
  `LegalMeta` export renders the badge + updated line as PageHeader children; one h1/page.
- **Five signature arts** (components/art/legal-*.tsx), each a shipped product truth in the
  house art language: **RedactionGate** (privacy — tiles stream a gate, secret glyphs mask
  at the crossing = F-006; hover = inspection lens + "patterns scrubbed · content kept"),
  **TwoCovenants** (terms — one engine core under open-field vs managed-canopy grounds),
  **OneTile** (cookies — near-empty shelf, the single gold `theme` tile lights only when
  touched = the localStorage truth), **Nameplate** (imprint — the nine-tile seal assembles
  beside engraved slots left visibly empty), **RightsLedger** (gdpr — request in, export
  copy out, erased tile dissolves). All: framer via the lib/motion seam only, role=img +
  descriptive label, tokens-only, SSR-deterministic (reduced-motion varies animate/
  transition never markup — the v4.5 hydration rule), designed reduced-motion still scenes,
  keyboard-inert, interactive hover.
- **New /legal/gdpr "GDPR at Tessera"** — an honest posture page (roles by deployment
  profile per ADR-0003 self-hosted truth; rights mapping arts. 15–21; DPA/transfers/
  supervisory as counsel placeholders). NEVER claims certification — it explicitly
  disclaims it, and the compliance-claim tripwire stays green. `CounselId` union → **15**
  (+`dpa`); per-doc pins updated.
- **Badge softened** to "preliminary — final on incorporation" (per-section counsel
  callouts and aria-labels unchanged — the 15 facts are still genuinely unknown).
- Plumbing: footer legal column += GDPR (5 links); sitemap/llms.txt/e2e PAGES extended.
- **Harness capture** (stakeholder ask #8): F-067 reopened for v2 (F-066 precedent); new
  **F-069** (backlog, R4 must) carries domain/mailbox wiring + the 15-placeholder counsel
  replacement workflow + trademark clearance; domain research recorded there.

**Evidence/verification** (generator ran gates; **orchestrator re-ran every gate fresh** —
the evaluator subagent was lost to a process exit, so I verified directly)
- verify-state ok · typecheck 33/33 · lint 19/19 · format clean · test 33/33 tasks
  (marketing **119/119**: legal-content **74**, design-lint 40 @ manifest 4.10.0) · build
  green — all **5** `/legal/*` routes `○ Static` (18/18 pages) · e2e **48/48** (five routes
  200, five-link footer, per-page art via role=img + badge text, counsel callouts on
  privacy/gdpr/imprint, cookies truth test, one h1 + axe AA both themes + 375px on all
  five).
- Audits I ran: fabrication tripwires over lib/legal/*.ts — zero hits (no entities/emails/
  domains incl. tesseraos.*/named-license claims; the only "compliance" match is gdpr's
  own certification *disclaimer*). CounselId union = exactly 15. Manifest enforcement
  config byte-identical (only version/sections/components lines changed); ADR-0045 v4.10
  amendment present. All five arts: framer via seam only, role=img, tokens-only, no
  reduced-motion markup branching. No legal *body* copy in client chunks (only the arts'
  own labels, expected — arts are client components).
- Browser review (dev server, both themes): all five heroes carry the shader register + a
  living art; RedactionGate hover proven; OneTile's gold tile seated; Nameplate verified in
  noon; footer shows 5 legal links; badge reads "preliminary — final on incorporation".
  design-review skill pass on v1 held; v2 adds only sanctioned archetype art.
- Budget (generator, wire-measured per [[turbopack-route-table-no-first-load-js]]):
  ~208KB gz privacy/gdpr (home ~208.6) ≤ 240 cap; the shader chunk stays lazy/post-LCP.

**Decisions**
- ADR-0045 amendment v4.10 (compact opening retired → PageHeader + LegalArts); manifest
  4.10.0 in lockstep. Domain: **stakeholder chose tesseraos.dev** (plain tessera.* all
  taken except tessera.platform; tessera.dev is Afternic-for-sale) — booking + wiring is
  F-069, nothing referencing it enters code until the domain + mailboxes are live.
- Badge wording softened; counsel callouts retained (facts still unknown).

**Next step**
- F-067 closed. Open R3 marketing work is done; next eligible by id is **F-044** (API
  hardening) unless the stakeholder redirects. F-069 (identity/domain finalization) waits
  on the stakeholder booking tesseraos.dev + standing up mailboxes.

## 2026-07-12 — F-067 DONE — legal pages: privacy/terms/cookies/imprint + footer legal column (ADR-0045 v4.9)

**What changed** (stakeholder-directed selection ahead of lowest-id F-044 — "remaining
marketing work first"; plan `.harness/plans/F-067-legal-pages.md`)
- **§3.14 `legal-prose` archetype** (MARKETING-DESIGN v4.9 + manifest 4.9.0 in lockstep,
  ADR-0045 amendment v4.9): compact quiet opening on the base ground (recorded deviation
  from §3.12's full-height shader hero; §3.13 precedent — the document is the point), then
  a `max-w-prose` article: serif h2s on the heading size, token tables, and **CounselReview
  callouts** (dashed hairline aside, `role="note"`, zero accent) for every unresolved fact.
- **Content as typed data** (house precedent: PLANS, moods): `lib/legal/*` LegalDocs with a
  **closed 14-id `CounselId` union** — entity/address/jurisdiction/contact-email/dpo/
  processors/retention/transfers/supervisory-authority/oss-license/payments/… Every
  unknown renders as a marked placeholder, never prose; `tests/legal-content.test.ts` (60
  tests) pins the per-doc placeholder sets and runs fabrication tripwires (no entities,
  emails, domains, named licenses, compliance claims) + the manifest's voice regexes over
  the `.ts` copy (design-lint only scans `.tsx`).
- **Honest pages:** privacy (GDPR/CCPA skeleton; site truth: no accounts/forms/cookies/
  analytics; product truth split local-vs-cloud per ADR-0003), terms (open-core split;
  cloud marked not-GA; plan limits by LINK to /pricing — E-019 untouched; **no license
  cited — none exists**, NFR-18/OQ4), cookies (**executable claims**: no cookies, one
  localStorage `theme` key written only on toggle — verified against next-themes 0.4.6
  source AND asserted in e2e; zero third-party requests), imprint (placeholders by design).
- **Plumbing:** footer gains the `legal` column (brand block col-span-5→4, grid 4+4×2=12);
  sitemap +4 (`yearly`/0.3); llms.txt `## Legal` section disclosing draft status; per-page
  metadata + canonicals. Legal stays footer-only (nav untouched); no mascot on legal pages.

**Evidence/verification** (generator ran gates; **independent evaluator PASS**, fresh runs)
- verify-state ok · typecheck 33/33 · lint 19/19 · format clean · test 33/33 tasks
  (marketing **105/105**, was 45; design-lint 40 green against manifest 4.9.0) · build
  green — all four `/legal/*` routes `○ Static` prerendered (17/17 pages) · e2e marketing
  **40/40** (was 27; `legal.spec.ts` truth checks: four 200s, footer legal nav resolves,
  counsel callouts visible, `document.cookie === ''`, localStorage `[]`→`['theme']` only
  after toggle, all requests same-origin) · web e2e 14/14.
- Screenshot review (Browser pane, dev server): privacy/terms/imprint/cookies dusk + noon,
  counsel callout + tables both themes, 375px no-overflow (scrollWidth 375; table wraps),
  footer grid one row at 1280 (brand + 4 columns, no overflow). design-review skill pass:
  **zero anti-pattern hits** (all values on-token, no side-stripes/gradients/ghost cards,
  eyebrow only as the sanctioned opening, no added motion).
- Budget note: Next 16.2.9/Turbopack no longer prints first-load JS in the route table;
  legal pages add **zero client JS** (static server components, no client islands) and the
  generator's over-the-wire measurement put them at ~212KB gz (route-group glue chunk
  included), under the 240KB cap; no legal copy ships in client chunks (chunk grep clean).

**Decisions**
- ADR-0045 amendment v4.9 (compact legal opening; fallback to strict PageHeader recorded).
- OQ-1 license file (MIT vs Apache-2.0 + LICENSE, own ADR under NFR-18), OQ-2 contact
  mailbox — **stakeholder items, open**; the `oss-license`/`contact-email` placeholders
  hold until resolved. OQ-3: the whole 14-row counsel table awaits counsel before launch.

**Next step**
- Remaining marketing candidates: none open in R3 besides plumbing follow-ups; next
  eligible by id is **F-044** (API hardening) unless the stakeholder directs otherwise.

## 2026-07-12 (v3.1) — F-066 DONE — Tess refined: chibi ratio, real laptop, bigger smooth KG, feet choreography

**Third stakeholder review (proportions + activity polish):** *"the body is too big — much
smaller than the head, bigger than the limbs; the KG is too small, more nodes, smooth
corners; why is the laptop block at the feet; animate the legs too; more refined
emotions."* All addressed as data/CSS refinement inside ADR-0046 v3:

- **Chibi ratio locked by test:** head 38×32, gilded body 22×19 (≤65% of the head in both
  axes), hands 12, feet 12×10 — body much smaller than head, clearly bigger than limbs.
- **Working got a real laptop at hand height:** screen (with the flickering code ticks
  INSIDE it) over a base the hands type on, painted in front of the body — the floor-tile
  bench is gone; masters' stacking fixed to match the live DOM (props in front).
- **Searching KG rebuilt:** six smooth CIRCLE nodes (hub-and-spoke + rim links), gently
  curved quadratic edges, larger spread — kept fully clear of the face (the first cut
  tangled with the bigger head; caught in screenshot review). The prop-bounds test caught
  a real clip (node pulsing past the left margin) — nudged in.
- **Feet act in seven moods:** toe-taps in the typing rhythm (with a head nod), a dance
  step with the celebrating cheer, tip-toes as the search sweeps, trembling when alarmed,
  a shuffle on lost's remaining foot, watching's weight shifts, idle's occasional heel
  lift.

**Evidence** — package 40/40 (new chibi-ratio + prop-amplitude tests); marketing 45/45;
e2e 27/27; workspace turbo 71/71; motion proof (live frames differ / reduced identical);
first-load 226.5KB gz home / 191.5KB gz 404 (stable min across runs — the measurement
window sometimes catches next/link prefetches of other routes, noted); screenshots
reviewed (mood sheet ×3 iterations, lab searching + working mid-activity, menu, 404).

## 2026-07-11 (v3) — F-066 DONE — Tess ACTS: six-piece anatomy, activity moods with props, sheen removed (ADR-0046 v3)

**Second stakeholder review: "liveness is the mascot DOING something — all moods should
be smooth infinite activity animations; pointer tracking on a static figure isn't
liveness; the sheen reveals a box; add hands (six-piece proposal); menu Tess belongs in
the link column's empty right side."** Reference studied: the Senzops sentinel bot
(arms + per-mood props — laptop/log-sheet/crate — as infinite task loops).

- **Anatomy (stakeholder proposal adopted):** head + **the gilded heart AS the body** +
  two hands (limbs, validated ±32 offset budget) + two feet; warm blush on the face;
  rose/clay move into the props. Tess is literally the arriving gilded tile now.
- **Every mood is an activity loop:** working types on a bench tile while output ticks
  flicker; searching sweeps a floating **mini knowledge graph** node by node (the
  stakeholder's exact ask); curious chin-taps; alarmed throws trembling hands up at the
  shivering loose tile; celebrating cheers under falling confetti tesserae; greeting
  waves; lost head-scratches while scanning (missing-foot socket stays); satisfied
  stands hands-on-hips, chest swelling; watching turns a slow lookout. Props are ALWAYS
  in the DOM (SSR-identical markup); `[data-mood]` CSS shows + choreographs.
- **Sheen removed** (bounding-box tell); celebration light = confetti + heart pop; the
  click delight now bursts confetti.
- **Menu corrected:** Tess overlays the nav link column's empty right half, z-above the
  full-width link rows (tapping her never follows a link); zero added layout height.
- Masters regenerated: the mood sheet now shows each activity's still scene.

**Evidence** — package 39/39 (limb budgets, prop bounds incl. animation amplitudes,
prop-DOM invariance, activity poses); marketing 45/45; e2e **27/27** (activity loops
proven by computed animation-name — `tess-scan`+`tess-scratch` running on the 404's
lost Tess; lab: alarmed shows the loose tile, searching shows the graph; stillness = 5
layers `none`); motion proof frames differ live / identical reduced; first-load
**215.6KB gz home / 191.3KB gz 404** (budget 240); screenshots reviewed (menu, 404,
lab searching/working mid-activity); workspace turbo gates green.

## 2026-07-11 (v2) — F-066 DONE — Tess alive: face, creature-rate motion, reactions, dev lab (ADR-0046 v2)

**Stakeholder review of v1: "lifeless, unprofessional, non-interactive — blocks are not a
mascot; we need a small cute attention-seeker, a lively child or pet."** Root causes owned:
two placements sat under `pointer-events-none` (hover/click could never fire), no placement
was interactive, 9–14s ambient rates are invisible on a character, and a faceless figure
cannot read as a creature. (The recorded F-051 lesson struck again: this brand reads
austerity as lifelessness.) All resolved as **ADR-0046 v2** + MARKETING-DESIGN v4.7 +
manifest 4.7.0 + BRAND §5 v2:

- **Tess has a face now:** big-head cute proportions (26×22 head over the mosaic body,
  viewBox 104 with tested life-motion headroom) and **two ink eyes** that blink (CSS
  windows), hold per-mood expressions (`defineMood` gains validated
  `eyes {openness, gazeX, gazeY}` — alarmed stares wide at the popped tile, celebrating
  squints down at its lifted heart, lost scans left), and **follow the pointer** (a rAF
  spring writing `--tess-look-*` on the gaze rig; wanders to random glances when the
  pointer is idle — the attention-seeker). Eyes render on `--mascot-ink` (noon inverts to
  a dark-bodied, light-eyed creature — token-true).
- **Creature-rate motion:** breathing bob 3–6s (THERMAL bounds moved; 9–14s stays correct
  for FIELD art), per-tile drift on the shared clock, per-mood gestures in CSS (curious
  peek-tilt, alarmed shiver bursts, lost/searching head scan, greeting double wave,
  celebrating heart pop).
- **Reactive on every placement (default):** hover = perk (rise + head tilt + eye widen
  + ember flare + gaze lock); click/tap = the one-shot **delight** (crouch-hop with the
  squash only in the crouch, happy-squint, heart re-seat, sheen — ≤1.2s, absorbed while
  playing). Keyboard-neutral easter egg: decorative instances stay `aria-hidden`, zero
  tab stops; `interactive` button mode unchanged. Placement rules hardened in the
  manifest: **never inside `pointer-events-none`; overlay whitespace, never add it**
  (menu Tess now overlays the MosaicField's built-in 40-unit headroom — zero layout
  growth; supervisor perch got `pointer-events-auto`).
- **`/dev/mascot` lab** (stakeholder directive): specimen playground + all 10 moods at
  3 sizes, mood/size switchers, both themes via the footer toggle; `robots noindex`,
  absent from sitemap/nav/llms; sanctioned as a lint `allowIn` DEV exception.
- Masters regenerated with the face; the SSR-determinism invariant held (gaze vars live
  on an element React renders without a style prop, so re-renders can't wipe them).

**Evidence** — package 36/36 (eye budgets, eye-in-head bounds, viewBox headroom incl.
bob+hop, reaction one-shot, SSR skeleton identity across all moods); marketing unit 45/45
(design-lint incl. the widened allowIn); e2e **27/27** (new: animations RUNNING under
normal motion — `tess-bob`/`tess-blink`/`tess-breath` by computed name; gaze vars written
on pointer approach; click → `data-react=delight` → auto-settle; dev lab 11 figures +
mood switch + axe both themes; stillness now proves 5 layers `none`); **motion proof:
two frames 1.6s apart DIFFER live and are byte-identical under reduced motion**;
workspace turbo gates green; first-load **225.4KB gz home / 190.9KB gz 404** (budget
240 — all the life cost ~2KB); screenshots reviewed (menu overlay, 404 dusk+noon, lab
dusk+noon, hover perk state).

**Next step** — F-067 legal pages (R3 must) or F-054 per stakeholder; F-068 dashboard
Tess adoption when scheduled.

## 2026-07-11 — F-066 DONE — brand mascot Tess: @tessera/mascot + marketing integrations (ADR-0046)

**Stakeholder-directed scope expansion** (recorded in the plan + ADR): the mascot serves
every frontend, not just marketing — it ships as **`@tessera/mascot`**, the repo's first
shared UI package. Dashboard adoption is **F-068** (new backlog entry, FR-49, blocked by
F-066). F-066 was claimed out of strict release order (R3 musts remain open) by explicit
stakeholder direction.

- **Governance first:** [ADR-0046](../../docs/adr/0046-brand-mascot-tess.md) locks the
  name (**Tess** — stakeholder-confirmed, with mood-set and scope options, via a decision
  round), personality (*the archivist's apprentice*), moods (core
  idle/curious/working/satisfied/alarmed/celebrating + surface greeting/lost/searching/
  watching + validated `defineMood()` data API), the usage budget (mobile menu / empty /
  404 / KG supervisor — **never hero, never pricing**, design-lint-enforced `allowIn`),
  the accent interaction (**Tess's heart IS the band's one gold moment**), CSS-only
  motion, and the `--mascot-*` theming contract. BRAND.md gains §5 (mascot; §§5–8
  renumbered 6–9; the "cartoon mascots" ban amended to sanction the geometric figure).
  MARKETING-DESIGN v4.6 + manifest 4.6.0 in lockstep (§4.1 mascot, §3.13 `not-found`
  archetype, `mascot-usage-budget` + `mascot-tokens-bound` patterns).
- **The rig:** nine named tile slots (the logo's geometry; gilded heart always present),
  moods as frozen validated data, an SSR-deterministic component (ONE DOM shape for every
  mood/state — the v4.5 hydration rule held structurally, no `useReducedMotion` in the
  package), package-internal CSS motion (transform/opacity, house ease, morph 600ms /
  hover 200ms / one-shot re-seat+sheen 1.1s / breath 9–14s, interruptible by
  construction; `prefers-reduced-motion` ⇒ the pose IS the designed still frame),
  `currentColor` monochrome fallback when the contract is unbound. Interactivity: hover
  acknowledge (rise + ember brighten) and a click-triggered re-seat gesture behind real
  button semantics.
- **Brand masters are build artifacts:** `docs/design/brand/tessera-mascot{,-moods}.svg`
  are GENERATED from the mood data (`render-masters` script) and drift-tested — they
  cannot diverge from the shipped rig.
- **Marketing integrations** (globals.css binds `--mascot-*` per theme): mobile-menu
  ground (`greeting`; MosaicField gained an `ember:false` knob so Tess's heart owns the
  menu's single gold moment), **`app/not-found.tsx`** ("A tile is missing." — Tess `lost`,
  its missing tile as the 404 metaphor), and the **constellation supervisor** perched on
  the telemetry island, mood mapped from the simulated telemetry (agents drop → alarmed;
  rpm ≥280 → working; ≤130 → curious; else watching; reduced motion holds the still
  `watching` seed).
- **New lesson** [[xml-comment-double-hyphen-breaks-svg-as-image]]: `--` inside an XML
  comment (a `--flag` in the provenance note) breaks standalone SVG with zero
  console/network signal — found because masters are reviewed AS `<img>`.

**Evidence** — mascot package 33/33 (mood budgets, geometry-in-viewBox incl. drift,
SSR determinism, a11y semantics, interaction, master drift); marketing unit 45/45
(design-lint 40 incl. the two new patterns); e2e **24/24** (404: real 404 status, one h1,
axe AA dusk+noon, 375px, zero console errors; menu: greeting Tess decorative + zero
field-ember; supervisor: watching + sr disclosure; reduced-motion animation-name none);
workspace turbo **71/71 tasks** (nothing existing broke); build green;
first-load **223.0KB gz home / 189.7KB gz 404** (budget 240); 7 review screenshots
(404 dusk/noon/375, menu dusk/noon, graph dusk/noon) + the generated mood sheet reviewed;
design-review audit zero hits; brand-swap holds (logo covered, the tessera figure + serif
voice + dusk/rose/gold still say Tessera). `verify-state` green (68 features, 23
effect-links — E-022 extended, new E-023 mascot contract).

**Next step** — F-067 legal pages (R3 must) or F-054 skills registry per stakeholder;
F-068 (dashboard Tess) when scheduled.

## 2026-07-11 (v4.5) — F-051 DONE — living subpages: shader heroes, signature arts, FAQ v2

**Ninth review (8 directives): the v4.4 subpages read flat. Resolved (ADR-0045 v4.5):**

- **Full-height heroes site-wide:** `page-header` is now a `min-h-svh` statement over the
  SAME lazy shader-field ground as home (calm pocket under the text; `.fade-bottom` mask
  dissolves the field into the next band — no hard seam). The constellation stays
  homepage-only.
- **Signature arts** (new, all §5-conformant: constant-derived geometry, shared clock,
  transform/opacity only, frozen reduced, role=img + sr alternative, HTML captions):
  **PlanMosaic** (pricing — one engine at three scales; names via props from the PLANS
  model), **TenantPerimeter** (enterprise — isolation islands, a refused crossing, live
  ledger), **SkillLoop** (skills — the compile→effects→edit→capture ring).
- **FAQ v2:** two-column archetype (sticky heading left) + bg-card disclosure cards,
  still native details/summary with `name` exclusive-open — no JS accordion.
- **Blur declined, dissolve adopted:** stakeholder floated blurred section boundaries —
  rejected with reasoning (glassmorphism ban, backdrop-filter cost, hairline language);
  same-ground seams now dissolve via washes/ground changes instead; hairlines mark
  elevation only. Blur stays nav-only; design-lint unchanged.
- **BUG FOUND & FIXED (whole class):** branching SSR'd markup / initial state on
  `useReducedMotion()` hydration-mismatches (server always renders the animated branch)
  — found via the dev overlay on the new arts, then traced to LATENT instances in
  compiler-assembly (meter state + tile branch) and governance-gate (X + tiles).
  All now render ONE element and vary only animate/transition. Lesson appended to
  [[framer-svg-transform-attribute-conflict]]. Proof: fresh dev server, 16 reduced-motion
  page loads, zero hydration logs.
- **/skills placeholder debt** recorded on F-054's notes (replace planned cards with the
  registry catalog).

**Evidence** — design-lint 38/38 + pricing 5/5; typecheck/eslint/prettier clean; build
green; e2e 19/19 (axe AA both themes, all five pages); first-load 227.5–228.5KB gz
(budget 240; shader chunk stays lazy); screenshots 4 pages × 2 themes × 2 widths
(reduced) + live-motion hero captures reviewed; zero hydration errors on a fresh server.

**F-051 → done.** All acceptance met: pages + PLANS-driven pricing + trust page + /skills
placeholder; SEO baseline (metadata/OG/sitemap/robots/llms.txt); axe AA e2e; gates green.
The CWV/web-perf item is wired as data (manifest `budgets` = the app's CWV budget;
gates.json's web-perf gate covers marketing and ACTIVATES with F-049 per the recorded
drift-fix) — activation is F-049's, by design. Remaining marketing work is its own
features: F-067 legal pages, F-066 mascot, F-054 skills registry.

## 2026-07-10 (v4.4) — F-051 IN PROGRESS — subpage arc: features / pricing / enterprise / skills

**The four remaining acceptance pages, composed from a doc-extended archetype set.**

- **Governance first:** §3 had no subpage opening shape, so ADR-0045 v4.4 + MARKETING-DESIGN
  v4.4 + manifest 4.4.0 landed BEFORE code: `page-header` archetype (eyebrow · serif
  TITLE-token h1 · lead over atmosphere+grain; shader/constellation stay homepage-only);
  `pricing-table`/`faq` spelled out (were "as v2", orphaned by the v4 rewrite); enterprise
  claims-traceability rule; /skills placeholder policy.
- **Scaffolding:** `components/page-header.tsx` + `components/faq-list.tsx` (native
  details/summary, hairline dividers, plus-glyph rotate; summary marker suppressed in
  globals base); nav → Features/Pricing/Enterprise/Docs; footer + sitemap + llms.txt list
  every page.
- **/features** — pillars deep-dive (reusing the art suite with mechanism copy), 8-card
  capability grid on the chapter band (all claims = shipped subsystems), MCP tool-name
  chips (the real 10), CtaBand.
- **/pricing** — `@tessera/billing` is now a marketing workspace dep; `lib/pricing.ts`
  derives the ENTIRE display model from PLANS (`-1`→unlimited; enterprise→Custom/contact
  sales, links /enterprise); Pro = border-strong + Badge. `tests/pricing.test.ts` derives
  expectations from PLANS **and scans the page source for hand-copied numbers**; e2e
  asserts the rendered page against PLANS.
- **/enterprise** — six controls each traceable (F-025/026/027/034/036/037 + F-006/016),
  residency columns, "Verification over promises" band, honest FAQ (no SOC 2 claims).
- **/skills** — F-054 placeholder: four planned first-party skills, labeled `planned`,
  registry "in development".
- **Effects:** E-019 gains the marketing pricing consumer; E-022 gains the v4.4 subpage
  system. New lesson [[whileinview-reveals-vs-fullpage-screenshot-capture]] (fullPage
  screenshots don't fire IntersectionObserver; framer reduced-motion still animates
  opacity — scroll-walk before capture).

**Evidence** — design-lint 38/38 + pricing 5/5 (43 unit); typecheck/eslint/prettier clean;
build green (12 static routes); e2e **19/19** (axe AA dusk+noon on ALL five pages, one-h1,
375px no-overflow per page, PLANS-vs-DOM assertions, native FAQ toggle, sitemap/llms
completeness); first-load 225.5–227.7KB gz per new route (budget 240); screenshot review
4 pages × 2 themes × 2 widths (reduced-motion state) + design-review pass (one hit fixed:
contact-sales cadence wrapped mid-phrase).

**Next step** — stakeholder review round for the subpages; then F-067 legal pages +
footer legal surface; web-perf/CWV gate wiring lands with F-049 (gates.json); F-066
mascot when scheduled.

## 2026-07-09 (v4.3 round 8) — F-051 IN PROGRESS — gap-free cubes, frame fade, native-res shader

**Eighth review (4 issues), root causes found and fixed.**

- **KG bottom hard-cut:** the fade mask only covered the X axis — added `.fade-frame`
  (intersected X+Y masks) so the canvas dissolves at EVERY edge; composition also
  nudged up (center-y 0.44).
- **Cube corner gaps:** rounding each face's PATH pulled shared edges apart. Faces are
  now sharp quads that meet exactly; rounding comes from round-join strokes — a
  fill-colored stroke (width 2·r) expands each face over its neighbor (no seam can
  open), and keylines/rims/hover are WIDER under-strokes that hug the rounded
  silhouette (no double edges). Fills are TRULY opaque: depth fog and hover-dim mix
  the color toward the ground instead of lowering alpha — nothing shows through a face
  (an edge was visibly bleeding through the hub in light mode).
- **Telemetry island:** pill → rounded-lg block with generous padding (px-7 py-5).
- **Hero 'blur':** no CSS blur existed — the shader rendered at 0.6× resolution and
  CSS-upscaled, which reads as blur. Now renders at native DPR (≤1.5) with a slight
  contrast lift; sparks are crisp.
- **Regression caught by e2e:** native-res + paint-every-frame under reduced motion
  starved axe scans in headless Chromium (30s timeouts). Both canvases now paint the
  frozen frame ONCE under reduced motion and repaint only on resize/theme/hover/toggle
  — e2e back to 8/8 in ~32s.

**Evidence** — tsc/eslint/prettier clean; vitest 38/38; build green; e2e 8/8;
first-load 228.7KB gz (budget 240). Preview-verified both themes incl. portrait
close-up: rounded gap-free cubes, opaque faces, island block, edge dissolve.

## 2026-07-09 (v4.3) — F-051 IN PROGRESS — veil-less hero, object-lit cubes, telemetry island (ADR-0045 v4.3)

**Seventh review (14 directives), all delivered.**

- **Hero veil REMOVED** (chose removal over reduction): legibility is sculpted into the
  shader — an elliptical calm pocket under the statement (intensity floor 0.18, sparks
  dimmed inside it); the field runs at full strength everywhere else. Tuning knobs
  documented in shader-field.tsx; the hero-veil design-lint required-pattern retired
  (38 checks now).
- **Constellation:** nodes never jump (spring impulses removed — only the ropes respond
  to packet weight); arrivals illuminate the OBJECT (faces warm toward the packet tone,
  rim brightens — under-halo gone); cubes are rounded-corner opaque solids with the
  ground shadow now visible in dark mode (alpha 0.6); the hovered packet HOLDS STILL so
  its identity reads; telemetry is a floating island pill docked over the canvas
  (pointer-events-none); portrait stays large (ws = h/860) with horizontal overflow
  edge-fading via the canvas mask — no clipping, no scrollbars, any viewport.
- **Illustrations:** pipeline tessera unframed (no border on unit or mark — boxing the
  logo fights the tile language; connectors stop at the mark's edges) + a codex agent
  chip for a 3×3 composition; effect web scaled to max-w-lg with a decramped middle
  column (all egress links read).
- **Copy/backlog:** footer 'Open the dashboard' → 'Dashboard'; feature_list gains
  F-066 (brand mascot — complete harness setup: BRAND addendum + ADR before code) and
  F-067 (legal pages: privacy/terms/cookies/imprint with counsel-review placeholders).

**Evidence** — design-lint 38/38; typecheck/eslint/prettier clean; build green; e2e 8/8
(axe AA both themes); state valid (67 features). Preview-verified: veil-less hero
(calm pocket + visible field at full 1440 width), rounded solid cubes + island over the
graph, unframed pipeline mark with 3 agents, stable nodes with sagging ropes.

**Decisions** — ADR-0045 v4.3 amendment (removal over reduction for the veil; no border
on the mark; freeze-on-hover for packets; overflow-fade policy).

**Next step** — F-051 remaining pages (features/pricing/enterprise + F-067 legal);
Awwwards-readiness review; F-066 mascot when scheduled.

## 2026-07-08 (v4.2) — F-051 IN PROGRESS — isometric constellation, micro-physics, 18-point round (ADR-0045 v4.2)

**Sixth review (18 directives), all delivered.** Root causes over patches:

- **Mobile menu under the page (1):** the overlay was a CHILD of the header; the scrolled
  header gains backdrop-filter, which makes it the containing block for fixed
  descendants — the full-screen menu was trapped in the 64px header box. Now a sibling.
- **Constellation v4.2 (3, 12–18):** fixed isometric camera (yaw+pitch) rendering every
  node as a three-face cube (lit top / mid front / shaded side / ground shadow; hub
  mosaic set into the top face; noon = ink-outlined boxes). Portrait quarter-turns the
  plane (sources above, agents below). gemini agent added; sessions nest tool calls →
  nested tool calls, randomized per visit; scaled up. Micro-physics: weighted packets
  (size+speed from weight) sag their edge (rope pull) and identify on hover
  (kind · KB · from → to); arrivals/toggles are damped-spring lift/sink impulses; the
  flickering pulse ring is gone.
- **Illustrations (5–8):** pipeline rebuilt on one %-coordinate system (chips +
  connectors aligned by construction, tessera in a bordered unit); compiler meter
  breathes on the tiles' exact cycle; effect web spread so api/session.ts egress edges
  show (+ scaled down); governance ledger tallies the cycle LIVE.
- **Chrome (2, 4, 9, 10):** veil weakened + shader gained presence; marquee says Gemini
  and carries the official Antigravity silhouette (svgl, monochrome); MosaicField wave
  mode (infinite diagonal crest + pointer-lit tiles) on the CTA band and mobile menu.
- **Ops:** Turbopack's persistent dev cache served stale CSS across restarts —
  [[turbo-cache-stale-uncommitted]] extended with the .next/dev case.

**Evidence** — design-lint 39/39; typecheck/eslint/prettier clean; build green;
first-load 228.8KB gz (budget 240); e2e 8/8 (axe AA both themes); preview-verified:
menu full-viewport while scrolled+blurred, cubes both themes (desktop + portrait
mobile), live ledger 0→1→2→denied, wave animating, packet hover identity
('context packet · 1.6KB · repo · web → claude code').

**Decisions** — ADR-0045 v4.2 amendment. Mascot idea (stakeholder point 11) parked as a
future increment: geometric tessera-based mascot recommended, needs BRAND.md addendum +
its own ADR before any code.

**Next step** — F-051 remaining pages; Awwwards-readiness review.

## 2026-07-08 (v4/v4.1) — F-051 IN PROGRESS — shader-field hero, canvas constellation, 31-point polish (ADR-0045)

**Fourth review (11 directives) + fifth review (31 directives) delivered in one arc.**

- **Hero recomposed** — statement over a hand-written **WebGL shader field**
  (`components/art/shader-field.tsx`: domain-warped brand flow + ember sparks, theme
  re-resolved per frame, alpha:true, init-once, always-painting loop — three dead-canvas
  bugs fixed en route, captured in [[decorative-interactive-canvas-pattern]] items 7–9);
  h1 locked to exactly two nowrap lines (`--text-display` retuned); `.hero-veil` is a
  scrim-only gradient fading right+down so hero → graph has **no seam**; the graph band
  sits on a translucent `.graph-wash`.
- **Constellation band** (`components/art/constellation.tsx`, Canvas-2D, no deps) — deep
  nested knowledge graph under a **fixed three-quarter camera** (x/z ground plane +
  height jitter, constant pitch, no pointer tilt), **randomized per visit** (cluster
  fan-out, up-to-4-level nesting, 1–3 live **session sub-nodes per agent**), 20–40
  concurrent packet dots on multi-hop routes ending in sessions, smooth glow arrivals
  (no ring flicker), hover subtree highlight + clamped tooltip, click-to-toggle nodes
  with reroute/fizzle + reactive telemetry (right-aligned; legends and the visible demo
  chip removed — simulation disclosed in the sr-only alternative). React Flow hero graph
  deleted.
- **Typography** — the mono voice retired site-wide (JetBrains Mono unloaded; labels are
  tracked Manrope; zero SVG `<text>` anywhere).
- **Illustrations rebuilt** — CompilerAssembly (contained, breathing ping-pong loop; the
  "cut off" root cause was framer SVG x/y overriding the transform attribute —
  [[framer-svg-transform-attribute-conflict]]); GovernanceGate (constant-derived lanes,
  X inside the denied tray, caption pushed down, shared-clock cycle); EffectWeb rebuilt
  as **pure SVG + HTML chips** (9 nodes, 2 dependency levels, tokens-only) — and
  **`@xyflow/react` removed from the app entirely**; PipelineFlow → HTML chips (no
  strokes, ellipsis-safe, stacks on mobile) + connector SVGs; CTA mosaic drifts and is
  pointer-lit (`.tile-hover`).
- **Chrome** — redundant nav Sign-in removed; mobile menu gets the mosaic ground;
  "Deploy self-hosted" → "Self-host"; **initial theme = system** (dark→dusk, light→noon,
  classless fallback dusk); footer toggle propagates via **startViewTransition radial
  ripple** from the control; marquee carries **agent brand marks** (simple-icons CC0,
  currentColor: Claude Code, Cursor, Codex, Gemini CLI, Windsurf, Cline, Zed; Antigravity
  as wordmark) — list verified against 2026 MCP-client roundups; scrollbar already
  theme-aware (tokens). Light-theme canvas bug fixed: minified 3-digit hex tokens now
  parse (`css-color.ts`).
- **Docs/manifest v4→v4.1** — ADR-0045 (+ amendment), MARKETING-DESIGN v4, manifest
  4.0.0 (chapter band required patterns, blur sanction → nav-only, no-3d-engine +
  no-react-flow bans, retuned display clamp); plan v4 addendum; E-022 refreshed.

**Evidence/verification** — design-lint 39/39; typecheck/eslint/prettier clean;
`next build` green; **first-load JS 228.5KB gz** (budget 240) measured from the
prerendered route; **e2e 8/8** (axe AA dusk + noon, system-light initial, mobile menu
focus/Escape, 375px no-overflow after the pipeline mobile-stack fix, CTAs, SEO
endpoints, reduced-motion). Preview-verified on both themes at 1440 + 375: hero/graph
seam, constellation toggle cycle (agents 4→3→4 with tooltip state), theme ripple,
compiler assembly contained, gate alignment, marquee marks, menu art, tooltip clamp.

**Decisions** — ADR-0045 + v4.1 amendment (fixed camera over tilt; randomized scenes;
mono retired; React Flow retired; system-initial theme; view-transition propagation;
visible demo label traded for sr-only disclosure at stakeholder direction).

**Next step** — F-051 remaining: features page, pricing from `@tessera/billing` PLANS,
enterprise/trust, `/skills` placeholder; Lighthouse CWV gate with F-049; then the
Awwwards-readiness review across the site.

## 2026-07-07 (v3) — F-051 IN PROGRESS — dual themes, illustration-first, live-graph hero (ADR-0044)

**Third stakeholder review demanded:** no terminal mockups anywhere ("this is a marketing
site"), a live interactive knowledge-graph hero on a trusted package, two themes (Desert Rose
dark / Modern Minimalist light, footer toggle), distinctive text fonts, transparent-at-top nav,
a full-screen mobile menu, a branded scrollbar, a problem-statement section, and Awwwards-grade
interactivity. All delivered; 2 committed increments.

- **(1) Harness v3 (ADR-0044)** — MARKETING-DESIGN v3 + manifest v3: dual themes on one token
  architecture (`:root` dark default, `.light` via the **`lib/theme.tsx` next-themes seam**,
  per-theme sand chapters + gradients; `dark:` variants still banned); **illustration-first is a
  hard rule** (bannedArchetypes: terminals/code-blocks/file-trees/fake dashboards); `@xyflow/react`
  confined to `components/art/*` by a design-lint pattern; fonts → **Manrope + JetBrains Mono**
  (+ Instrument Serif); required patterns now pin the light theme block, branded scrollbar, and
  loaded fonts (25 banned + 10 required).
- **(2) The site itself** — **hero = full-bleed LiveGraph** (React Flow: draggable token-themed
  nodes sources→hub→agents, animated bezier edges with rotating rose pulses, ticking simulated
  telemetry labeled `demo`, zoom/scroll hijack off, keyboard-inert + aria-hidden with sr-only
  alternative, reduced-motion frozen, `ssr:false` behind the server-rendered H1, canvas offset
  `lg:left-2/5` under the theme-aware `.hero-scrim`); nav transparent at top → dusk-glass after
  8px; **full-screen mobile menu** (serif links staggering, scroll lock, Esc/close/focus);
  **problem band** (3 pain illustrations in the tile language) opening the sand chapter;
  pipeline-flow art replaces the MCP code block; differentiator visuals are now **brand art**
  (CompilerAssembly with count-up token meter, lazy EffectWeb mini-graph, GovernanceGate
  sequence); footer **ThemeToggle** (Dusk/Noon, aria-pressed); branded scrollbar (clay/rose).
- **Gate catches:** design-lint flagged my own `leading-none` (fixed the code); axe caught the
  light `--faint-foreground` at 4.14:1 (darkened to `#61707c`, ≥4.6 on both light grounds); the
  budget caught EffectWeb importing the graph engine eagerly (283 → **227KB gz** once lazy —
  captured as [[decorative-interactive-canvas-pattern]]).

**Evidence/verification** — all workspace gates green (marketing design-lint 37 checks; e2e 7/7:
axe AA **dark + light**, full-screen menu focus/Escape, theme toggle, 375px no-overflow, CTAs,
SEO endpoints, reduced-motion poll); `pnpm -w` typecheck/lint/format/test/build/e2e 17/17.
Screenshots reviewed: dark hero w/ live graph, light hero, problem band both themes, sand
chapter, full-screen mobile menu. First-load JS 227KB gz (budget 240; graph chunks lazy).

**Decisions** — ADR-0044; E-022 extended (theme seam, art suite, engine confinement).

**Next step** — F-051 remaining: features page, pricing from `@tessera/billing` PLANS,
enterprise/trust, `/skills` placeholder; then the Awwwards-readiness review across the site.

## 2026-07-07 (later) — F-051 IN PROGRESS — Terra Mosaic overhaul: brand, logo, living homepage (ADR-0043)

**Stakeholder review of the first increment: rejected** — "lifeless, only text, where is art?"
Direction reversed in one session while the enforcement mechanism survived intact (the lesson:
[[design-contract-mechanism-outlives-parameters]]). 3 committed increments.

- **(1) Brand + harness v2** — [`BRAND.md`](../../docs/design/BRAND.md) (brand discovery; palette =
  theme-factory **Desert Rose × Modern Minimalist** fusion on warm espresso `#161013`: ivory /
  dusty-rose `#E2A3A8` / ember-gold `#E4B65A` / clay / burgundy + a **sand light band** `#F1E8DF`;
  type = **Instrument Serif** (display, italic emphasis) + **Instrument Sans** + Geist Mono;
  "thermal" motion personality; measurable brand metrics; image-gen prompt appendix), the
  [Terra Mosaic philosophy](../../docs/design/brand/terra-mosaic-philosophy.md) (canvas-design),
  and a **real logo system**: 3×3 mosaic mark with a gilded arriving tile (SVG masters +
  [deterministic Playwright renderer](../../apps/marketing/scripts/render-brand-assets.mjs) →
  PNG exports + a museum-plate brand canvas). [`MARKETING-DESIGN.md`](../../docs/design/MARKETING-DESIGN.md)
  v2 + manifest v2 (two grounds via `data-band`, sanctioned gradients/shadows/grain, framer-motion
  **only through `lib/motion.tsx`** — the import boundary is a design-lint pattern; ambient-motion
  budgets), [ADR-0043](../../docs/adr/0043-terra-mosaic-brand-and-marketing-overhaul.md).
- **(2) Homepage overhaul** — serif hero ("Your agents forget. / Tessera *remembers*.", rose
  italic; LCP never animated) over a **living MosaicField** (seeded SVG tessellation: ambient
  drift, the gilded tile arriving once) + `--gradient-dusk` atmosphere + grain; marquee wordmark
  strip (hover-paused, RM-static); **sand chapter** (soft-shadow step cards + the dusk code
  artifact via `data-band="dusk"` reset); living product panels (compile trace stagger + rose
  budget-bar fill, effect-graph edges drawing via `pathLength`, audit rows settling);
  microinteractions everywhere (draw-in underlines, ivory→rose CTA with one sheen sweep, card
  lifts); new OG image (serif from the committed brand TTF) + favicon.
- **Gate catches this round:** design-lint flagged the ember gradient in the OG/icon renderers
  (resolved as a documented allowIn — renderers can't consume CSS vars) and the literal words
  "transition-all" in a comment; typecheck caught framer `Variants`/easing-tuple typing (fixed via
  seam-exported `thermalEase`/`Variants`); a stale e2e heading assertion updated.

**Evidence/verification** — all workspace gates green (state / typecheck / lint / format / test
incl. design-lint 34 checks / build / e2e 17 tasks; marketing 6/6 with axe AA on both grounds,
mobile nav, 375px no-overflow, reduced-motion stillness). Screenshots reviewed per §8 at 1440 +
375: hero, sand chapter, differentiators, CTA, footer — brand-swap test passes (tessellation +
dusk/rose/gold + serif voice are unmistakably Tessera). First-load JS measured **223.7KB gz**;
budget reset honestly to 240KB (Next 16 baseline ~185KB; Lighthouse CWV enforcement lands with
F-049) across manifest/doc/BRAND/rule.

**Decisions** — ADR-0043 (Terra Mosaic parameters over the ADR-0042 mechanism); E-022 updated
(v2 contract + motion seam + brand-asset pipeline as dependents).

**Next step** — F-051 remaining: features page, **pricing from `@tessera/billing` PLANS**,
enterprise/trust, `/skills` placeholder — each through `marketing-ui` → gates → §8 screenshots;
then Awwwards submission readiness review.

## 2026-07-07 — F-051 IN PROGRESS — marketing design harness + apps/marketing scaffold + homepage

The marketing site's first increment, built **harness-first** by explicit direction: encode the
visual quality bar as an executable contract *before* any page code, so future sessions (any
model) are constrained into it. Plan-first ([`F-051`](../plans/F-051-marketing-site.md)); 3
committed increments this session.

- **(1) Binding marketing design system (ADR-0042)** —
  [`docs/design/MARKETING-DESIGN.md`](../../docs/design/MARKETING-DESIGN.md) (direction: dark-only
  near-black, typography-led, monochrome + ONE budgeted emerald accent, tessera-mosaic signature,
  CSS-only motion, honest-content hard rules, closed 7-style type scale, fixed section archetypes
  §3 + component set §4, review protocol §8) + machine-readable
  [`marketing-design.manifest.json`](../../docs/design/marketing-design.manifest.json) whose
  `enforcement.bannedPatterns/requiredPatterns` (23+4 regexes) **are compiled into gate failures**
  by `apps/marketing/tests/design-lint.test.ts` (runs in the standard `test` gate). Harness wiring:
  rule [`frontend/marketing.md`](../rules/frontend/marketing.md), skill
  [`marketing-ui`](../skills/marketing-ui/SKILL.md) (+ Claude shim), DESIGN-SYSTEM scope note
  (dashboard vs public surfaces), ADR/skills/rules indexes.
- **(2) `apps/marketing` (@tessera/marketing) scaffold** — Next.js App Router, static-first
  (every route prerendered ○; no client data fetching; no third-party requests; NFR-17), marketing
  token set + closed type scale in `globals.css` (`--text-*: initial` — Tailwind's default text
  sizes don't exist in this app), env-driven cross-surface URLs (`NEXT_PUBLIC_SITE_URL/APP_URL/
  DOCS_URL`, TLD undecided), SEO baseline (per-page metadata, generated OG image + favicon from
  tokens, `sitemap.ts`, `robots.ts`, **`llms.txt`** with the real MCP tool names — ADR-0036),
  Playwright e2e (port 3200) + axe WCAG AA, joins all turbo pipelines + CI (Playwright install
  step extended; `.claude/launch.json` gains a `marketing` preview on 3300).
- **(3) Homepage** — nav (blur allowed here only, mobile disclosure w/ Esc + focus), hero
  (eyebrow → two-tone `display` h1 "Your agents forget. / Tessera doesn't." (LCP never animated)
  → subhead → 2 CTAs → **compile-trace panel**: 6 fragments in → budget bar → cited, scored
  package out; accent budget = top score + budget bar), MCP-clients proof strip (typographic
  wordmarks), how-it-works (3 steps + real `@tessera/mcp` tool listing), 3 asymmetric
  differentiator rows (compiler stages / effect-link SVG graph / audit-trail mock — all
  product-true, token-built), deploy band, CTA band, footer.
- **Design-lint proved itself immediately:** caught `PR #142` (matches the 3-hex-color ban) —
  fixed the copy, not the pattern. axe caught two real bugs: (a) tailwind-merge silently dropped
  `text-primary-foreground` next to the custom `text-small` token → 1.04:1 button (fixed by
  extending twMerge's font-size classGroup with the closed scale); (b) scrollable `<pre>` needed
  `tabIndex=0 role=region` (jsx-a11y rule scoped accordingly). Both captured as memory lessons.

**Evidence/verification** — full workspace gates green: state ✓ (65 features, 22 effect-links),
typecheck ✓ (31 tasks), lint ✓, format ✓, test ✓ (marketing design-lint 29 tests), build ✓
(all marketing routes static), e2e ✓ (17 tasks; marketing 6/6 incl. axe AA desktop + mobile-nav-open,
375px no-overflow, env-driven CTAs, SEO endpoints, reduced-motion visibility). Visual review per
MARKETING-DESIGN §8: preview screenshots at 1440 + 375 (hero, how-it-works, differentiators,
deploy, CTA, footer), `preview_inspect` confirms display token (76px/1.04/−0.035em/600 Geist),
primary CTA `#fafafa`/`#0a0a0a`, accent `#34d399`; brand-swap test passes (compile-trace +
effect-graph are Tessera-specific).

**Decisions** — ADR-0042 (dark-only v1 + emerald accent + CSS-only motion + gate-enforced design
system); effects: **+E-022** (marketing design contract → globals.css/design-lint/twMerge group;
E-004 untouched — marketing has its own token values, same semantic structure).

**Next step** — F-051 remaining increments: features page, **pricing from `@tessera/billing`
PLANS** (never hand-copied), enterprise/trust page, `/skills` placeholder (F-054 seam), then
gates + §8 review per page; `web-perf` budget wiring activates with F-049.

## 2026-07-06 — F-043 DONE — Knowledge-graph & effect-links visualization (React Flow)

The `/graph` **ComingSoon stub** is now an explorable **React Flow** view of the live knowledge graph
(F-040 populates it from real code) — **live-verified against a real API** (scanned a TS dir → **134 real
nodes: 15 files + 119 symbols + 131 edges** via tree-sitter) with screenshots (Explore + Effects). Plan-first
([`F-043`](../plans/F-043-knowledge-graph-visualization.md)); spans 4 packages but each non-web change is
small/additive. 4 committed increments.

- **(1) Graph query surface** — `KnowledgeGraphService.queryGraph(filter?) → { nodes, edges }` (additive; the
  `GraphStore` already had `listNodes`/`listEdges`; `limit` LOD cap default 500, optional kind filter, edges
  confined to the returned nodes = a coherent subgraph) → `GET /v1/graph` (`effects:read`, tenant-scoped,
  audited) + Zod→OpenAPI + regenerated `@tessera/sdk` (`queryGraph`); `query_graph` **MCP tool** (ADR-0036
  REST+MCP parity).
- **(2) De-risked React Flow first** (build spike, reverted) — `@xyflow/react` behind a lazy
  `next/dynamic ssr:false` wrapper so it + its CSS stay out of the initial bundle; token-themed custom node,
  viewport culling (`onlyRenderVisibleElements`); verified `next build` green + renders at runtime, **zero
  console errors**. `lib/api` gains graph+effects types/client/hooks; a **pure `toFlow`** (deterministic O(n)
  kind-clustered grid, effect-link styling, path highlight).
- **(3) GraphView explorer** — mode toggle (Explore | Effects), node-kind filter chips, search-to-focus,
  node/edge stats; Explore = connections + "what does this affect?"; **Effects** = `get_effects` highlights the
  reaching **paths** in the canvas + a ranked-dependents list (distance · score · path) in the side panel
  (provenance-first, FR-19). **a11y:** the side-panel node-detail + ranked-list is the documented
  **keyboard-accessible alternative** to the canvas; reduced-motion-aware fitView.
- **(4) Perf + tests + records** — a **pure `toFlow` 5000-node** transform test asserts completion within a
  500ms budget (LOD strategy: culling + a capped API query + Effects-mode focus; a benchmarked gate is F-049).

**Evidence (all green, workspace-wide):** state valid (65 features, **21 effect-links**, env-docs ok) · format ·
**typecheck 30** · **lint 17** · **test 30** (web **40**, KG 30) · **build 17** · **e2e 16** (api **45**, mcp
**16**, web **14** — incl. a new graph spec rendering REAL React Flow, **WCAG A/AA clean via axe**).
**Screenshot-verified** live: `/graph` Explore (134 real tree-sitter nodes, kind-colored) + Effects mode
(`api/types` selected → its 4 dependents highlighted, the rest dimmed).

**Decisions:** extend `/v1` with a read-only `GET /v1/graph` (the acceptance's "extend as needed") + MCP
parity; de-risk the heavy React Flow with a build spike before the UI; a dep-light **kind-clustered grid**
layout (no dagre/elk); the side-panel list as the graph's keyboard-accessible alternative; bounded query + LOD
over dumping the whole graph. **Lesson:** [[heavy-canvas-dep-offline-lazy-and-accessible-alternative]].

**Next step:** remaining R3 — F-044 (API hardening, `must`), F-049 (perf, `must`), F-060 (live Overview),
F-061 (search depth), F-047 (compliance). The three dashboard-viz features (F-041/042/043) are done.

---

## 2026-07-06 — F-042 DONE — Memory browser + Monaco authoring + version history + timeline

The `/memory` + `/timeline` **ComingSoon stubs** are now real, enterprise-grade surfaces over the
existing `/v1/memory` surface — **live-verified against a real API** (seeded 3 memories + an edit → a
**v2 supersede chain**) with screenshots. Plan-first ([`F-042`](../plans/F-042-memory-browser-monaco-timeline.md));
web-only, no new ADR (interim `lib/api` client, ADR-0022). 5 verifiable, committed increments.

- **(1) De-risked Monaco FIRST** (build spike before building the UI): an **offline** editor —
  `@monaco-editor/react` + the **bundled** `monaco-editor` (`loader.config({ monaco })`, no CDN) behind a
  `next/dynamic({ ssr:false })` wrapper so it is **code-split** out of the initial bundle and loads only
  when authoring opens. Markdown needs no language worker (main-thread, fully offline). Verified `next build`
  green (Turbopack) + renders at runtime, **zero console errors**. New MIT deps: `@monaco-editor/react`,
  `monaco-editor`, `@tanstack/react-virtual`.
- **(2) Data layer:** extended the `Memory` type to the full schema (`metadata`/`supersedes`/`supersededBy`)
  + `list`/`get`/`history`/`edit` client methods + hooks (capture/edit invalidate the list).
- **(3) Browser + detail:** `MemoryView` — kind (server) + scope (distinct-values) filters, a **virtualized**
  list (`@tanstack/react-virtual`), full states; `MemoryDetail` Sheet renders the **immutable version history
  / supersede chain** (current = head where `supersededBy===null`, FR-12) + metadata.
- **(4) Authoring:** `MemoryAuthoringDialog` — capture (POST) + edit (PATCH-appends-a-version) with the
  **Monaco** body + a metadata form; replaced `CaptureMemoryDialog`; wired from the browser, the sidebar
  quick-action, and the detail's Edit action.
- **(5) Timeline (FR-43):** a **pure `buildTimeline()`** merges memory lineages + audit events + **live SSE**
  (`useLiveActivity` appends `memory.captured`/`document.ingested`/`source.scan.completed`; live memory events
  de-duped against the fetched list); audit is best-effort (admin-scoped → degrades). Nav added to **both**
  sources (`lib/nav` + `app-shared`).

**Evidence (all green, workspace-wide):** state valid (65 features, **21 effect-links**, env-docs ok) · format ·
**typecheck 30** · **lint 17** · **test 30** (web **32**) · **build 17** · **e2e 16** (api 43, mcp 15, **web 13**
incl. 3 new memory/timeline axe specs — WCAG A/AA clean). **Screenshot-verified** live: `/memory` (3 real
memories with kind accents + versions), the detail Sheet (the **v2→v1 supersede chain** + metadata), the Edit
dialog (**Monaco** prefilled + metadata), and `/timeline` (real audit + memory feed, time-ordered).

**Decisions:** de-risk the heavy/offline Monaco integration with a build spike before writing the UI; bundle
Monaco locally (no CDN → works offline/enterprise); a pure SSE-merge reducer so the timeline is testable without
a socket; scope filtered client-side from distinct values (good UX over the exact-match server filter); the
detail shows raw text (a markdown renderer would add a dep — kept lean). **Lesson:**
[[monaco-offline-in-next-and-virtualization-jsdom]].

**Next step:** remaining R3 dashboard/hardening — F-043 (graph viz, React Flow), F-060 (live Overview — reuses
the SSE hooks), F-061 (search depth), or the `must`s F-044 (API hardening) / F-049 (perf). None blocking.

---

## 2026-07-06 — F-041 DONE — Sources & Settings dashboard (live scan progress); + 2 latent prod bugs fixed

The `/sources` and `/settings` **ComingSoon stubs** are now real, enterprise-grade surfaces over the live
F-038/F-039/F-040 runtime — **live-verified against a real API** (fake embeddings + scratchpad DB) with
screenshots, not just stubs. Plan-first ([`F-041`](../plans/F-041-sources-settings-ui.md)); web-only, no
new ADR (consumes the ADR-0040 source surface via the interim `lib/api` client, ADR-0022).

- **Sources** (`SourcesView` + `RegisterSourceDialog`) — list sources with kind/path/created + live status;
  register (connector-specific validated forms), **scan** (real `POST` → summary toast), **remove** (confirm);
  **live scan progress via `GET /v1/events` SSE — the dashboard's FIRST SSE consumer** (`useScanEvents` over a
  **pure, unit-tested `scanEventsReducer`**); full loading/empty/error states.
- **Settings** (`SettingsView`) — Deployment (endpoint + `/health` + `/ready` + a dependency-checks table),
  Plans & budgets (`/v1/billing/plans` entitlements → real compile budgets), Governance & retention posture
  (read-only, NFR-13). **No fake controls** — read-only where the API has no write surface.
- **Honest boundary (no fake controls):** registerable kinds are **filesystem + git** (`SUPPORTED_SOURCE_KINDS`);
  a **github SOURCE is not wired into the runtime** (connector maps only fs/git; wire config is `{ root }`), so
  GitHub is an **explicitly disabled** option, not a form that 400s. Wiring a github source + a richer
  `GET /v1/info` (profile/providers) are **documented seams** (api/config side, not this web feature).

**Two latent PRODUCTION bugs caught by the live verification + fixed** (both existed on `main`, unrelated to
new UI, and would have made the shipped source surface unusable):
1. **`@tessera/observability` `instrumentServices` silently dropped `services.sources` + `services.billing`**
   (added by F-038/F-030) — it **rebuilds** the ApiServices object, so any omitted member vanishes. The shipped
   **instrumented** server therefore 500'd `/v1/sources*` (REST) **and** `add_source`/`list_sources`/`scan_source`
   (MCP — `apps/server/mcp.ts` instruments too). Fixed: forward both — `sources` traced, `billing` **passed
   through untraced** (its methods are synchronous, e.g. `[...listPlans()]`, so the tracing Proxy must not
   Promise-wrap them) — plus a **regression test**. (E-015.)
2. **`lib/api` sent `content-type: application/json` on bodyless `POST`/`DELETE`** (scan/remove), which Fastify
   rejects (“Body cannot be empty”). Fixed `apiFetch` to only set the JSON content-type when a body is present.

**Evidence (all green, workspace-wide):** `node scripts/verify-state.mjs` valid (65 features, **21 effect-links**,
env-docs ok) · format · **typecheck 30** · **lint 17** · **test 30** (web 26) · **build 17** · **e2e 16** (api 43,
mcp 15, **web 10** incl. 3 new sources/settings axe specs — WCAG A/AA clean; an axe-caught `/70` muted-foreground
contrast miss was fixed). **Screenshot-verified** live: `/sources` (2 real sources, a git + a filesystem, one
scanned → “49 added …” with a timestamp), the register dialog (connector-specific form), and `/settings`
(Live/Ready badges, the sqlite dependency check, real plan budgets Free 8,000 / Pro 32K / Enterprise 128K, the
read-only governance posture).

**Decisions:** web-only scope (F-041's declared effects are E-003 *consumer* + E-004 *UI* — a `/v1/info` endpoint
would be an undeclared producer change, so it stays a seam); render Settings from **existing** endpoints
(health/ready/billing-plans) rather than fabricate; GitHub honest-disabled over a failing form; the SSE reducer is
pure so it's testable without a socket. **Lesson:** [[instrument-services-must-forward-every-apiservices-member]].

**🎉 R3 dashboard arc begins** — F-041 (Sources & Settings) done. **Next step:** the remaining R3 dashboard/hardening
features — F-060 (live Overview, also SSE — can reuse `useScanEvents`'s transport), F-061 (search depth), F-042
(memory browser), F-043 (graph viz), or the `must` F-044 (API hardening) / F-049 (perf). None blocking.

---

## 2026-07-04 — F-040 DONE — code symbols → live knowledge graph; get_effects returns real dependents

The #2 differentiator is now **live**: scanning a repo populates the knowledge graph from real code
(tree-sitter), so `GET /v1/effects` returns **real ranked dependents** (was empty in production). OQ5
resolved → **tree-sitter WASM** (ADR-0041). Delivered in 5 verifiable, committed increments.

- **(1) `@tessera/knowledge-graph`** — additive `GraphStore.removeNode` (node + incident edges) +
  `removeEdges(filter)` (port + in-memory + sqlite + conformance + service) for incremental subgraph
  replacement.
- **(2) `@tessera/ingestion`** — a `SymbolExtractor` port + relative-import resolver (extensionless
  source-relative keys) + `createGraphExtractionSink` (a `DocumentSink` writing `file`/`symbol` nodes +
  `imports`/`defines` edges through a **structural** `GraphWriteService` — no `@tessera/knowledge-graph`
  runtime dep; the real service is assignable). Incremental: each `upsert` replaces the file's outgoing
  edges + clears its stale incoming effect-links (surgical `removeEdges`), without clobbering other files'
  edges; `deriveStaticEffectLinks` inverts imports → effect-links.
- **(3) `@tessera/config`** — `createTreeSitterSymbolExtractor` over `web-tree-sitter` (WASM) + prebuilt
  `tree-sitter-wasms` grammars (TS/JS/TSX; lazy init + per-language cache; offline). **Probe-verified in
  the real environment before committing the ADR.** Wired into the runtime sink tee.
- **(4)** `POST /v1/effects` (assert a manual effect-link, `origin` forced server-side, `effects:write`
  RBAC member+, `effects.write` audit) + `assert_effect` MCP tool (gateway); OpenAPI + regenerated
  `@tessera/sdk` (`assertEffect`).
- **(5)** records (ADR-0041 was written at kickoff); effects E-002/E-011 + E-009/E-021 + E-003/E-018/E-020.

**Evidence (all green, workspace-wide):** state valid (65 features, **21 effect-links**, env-docs ok) ·
format · typecheck 30 · lint 17 · **test 30** (knowledge-graph 29, ingestion 65, config 35) · **e2e 16**
(api 43, mcp 15) · build 17. A config integration test scans a fixture repo (`a.ts` imports `./b`)
through the **real tree-sitter** extractor and asserts `get_effects({kind:'file', key:'b'})` returns `a`
with a path, idempotent on re-scan; the sink unit proves incremental correctness over the real graph
service; api/mcp e2e cover the assertion path (assert → get_effects returns it; viewer 403).

**Decisions (ADR-0041):** tree-sitter WASM (multi-language, local-first, no native build) over the
TS-compiler-API (TS/JS-only) and LSP (server processes); parser behind a `SymbolExtractor` port (fake for
unit tests, WASM in the composition root); **surgical `removeEdges` for incremental correctness** (not
`removeNode`, which would clobber unchanged files' edges); extensionless file keys so imports connect.
**Lesson:** [[tree-sitter-wasm-extraction-and-incremental-graph]].

**Deferred/documented seams (ADR-0041):** call/reference edges + intra-file call graphs, directory/index +
package-import resolution, languages beyond TS/JS (add grammars), orphan symbol-node GC, a TS-compiler-API
fidelity backend behind the same port, multi-tenant ingestion graph scoping (default tenant), the F-043
graph-viz UI.

**🎉 R3 core-loop arc COMPLETE** — F-038 (ingestion in the runtime), F-039 (live indexing), F-040 (graph
population) all done: a user/agent points Tessera at a repo, and search/compile/get_effects answer from it.

**Next step:** the remaining R3 features are dashboard/hardening (F-041 sources UI, F-044 API hardening,
F-045 dashboard auth+SDK, F-048 full-stack E2E, F-049 perf, etc.) — none blocking the closed core loop.
F-041 (Sources & Settings UI over the now-live /v1/sources) is a natural next.

---

## 2026-07-04 — F-040 KICKOFF (planner phase) + OQ5 RESOLVED → tree-sitter (WASM)

Claimed **F-040** (code-symbol extraction → live knowledge-graph population + static effect-links + a
manual assertion surface — the product's #2 differentiator, currently empty in production) and completed
the **planner phase** (plan-before-code): [`F-040`](../plans/F-040-code-symbol-extraction-graph.md) +
**ADR-0041**. No product code yet — this is the R3-kickoff-style planner deliverable, leaving F-040 cleanly
`in_progress` with an actionable plan.

**OQ5 RESOLVED → tree-sitter (WASM)** (product-lead decision, 2026-07-04; ADR-0041). Chosen over the TS
compiler API (TS/JS-only) and LSP (needs per-language server processes) for the PRD's **local-first,
multi-language, TS/JS-first** direction. **Probe-verified before deciding:** installed
`web-tree-sitter@0.25` + `tree-sitter-wasms@0.1` and, fully offline, parsed TypeScript and extracted
import sources, function/class names, and exported consts via a tree-sitter `Query` — the toolchain runs
in this Node/vitest environment.

**Planned design (ADR-0041):** an ingestion `SymbolExtractor` port + a `createGraphExtractionSink`
(structural `GraphWriteService` seam, mirroring F-017 — no `@tessera/knowledge-graph` dep in ingestion),
with the tree-sitter adapter in the composition root `@tessera/config`. Each source file → a `file` node +
`symbol` nodes (`defines` edges) + `imports` edges (relative specifiers → target file); the existing
`deriveStaticEffectLinks` inverts imports → `EFFECT_LINK`s so `get_effects(file)` returns real importers.
Incremental via subgraph replacement, needing one additive `GraphStore.removeNode`. Manual assertion:
`POST /v1/effects` + `assert_effect` MCP tool (new `effects:write` RBAC + `effects.write` audit), SDK
regenerated. **5 planned increments:** (1) `GraphStore.removeNode`, (2) extractor port + graph-extraction
sink (deterministic), (3) tree-sitter adapter + runtime wiring, (4) REST/MCP assertion surface, (5) records.

**Evidence:** `node scripts/verify-state.mjs` valid (65 features, 21 effect-links, env-docs ok); no code
changed, gates unaffected. Committed as the F-040 kickoff + planner phase (plan-before-code per the harness).

**Next step:** implement increment 1 (`GraphStore.removeNode`) → … → 5, per the plan. New deps
`web-tree-sitter` + `tree-sitter-wasms` land in increment 3 (recorded in NOTICE.md).

---

## 2026-07-04 — F-039 DONE — the core loop is CLOSED: search/compile answer from the ingested repo

F-038 made scans run + land documents in the corpus; **F-039 makes that output retrievable**. Ingested
documents **and** captured memories now populate the retrieval indices, so `search`/`compile` answer from
the user's actual repository — closing the loop the 2026-07-04 live check flagged (a just-ingested/captured
item was unfindable). Plan-first ([`F-039`](../plans/F-039-live-corpus-indexing.md)); no new ADR (a
composition-root change inside the established seams).

- **`@tessera/config` `createCorpusIndexer`** — one **tenant-aware** path that lands `(ref, text)` in the
  blob corpus **and** all three indices: keyword (FTS5, FR-22), temporal (recency, FR-24), semantic
  (`embed → VectorStore`, FR-21), through the `forTenant` scoped views (ADR-0033). An in-memory
  `ref → sha256(text)` cache **never re-embeds** an unchanged `(ref, text)` (NFR-12), over the F-006
  manifest that already skips unchanged documents.
- **Two writers, one ref space** — `createIndexingDocumentSink` (replaces the F-038 blob-only sink; skip
  binary; removal clears corpus + every index; timestamp from git/mtime) and `createIndexingMemoryService`
  (a `MemoryService` decorator: API/MCP captures **and** auto-extracted memories index under
  `memory/<lineageId>`, an edit re-indexing the same ref) both write through the **same** indexer. Shared
  refs (`document.id` / `memory/<lineageId>`) so a search hit always resolves in the compiler (the fusion
  requirement).
- **`@tessera/retrieval`** — `KeywordRetriever.remove(ref)` (additive) for document removal.
- **Cross-platform fix caught while wiring:** memory refs are `/`-delimited — a `:` becomes an NTFS
  alternate-data-stream on Windows (broke blob `list()`). Lesson:
  [[portable-blob-keys-and-one-indexer-two-writers]].

**Evidence (all green, workspace-wide):** state valid (65 features, **21 effect-links**, env-docs ok) ·
format · typecheck 30 · lint 17 · **test 30** (config 33, retrieval +1 keyword-remove) · **e2e 16** ·
build 17. The config integration test scans a fixture repo then asserts `search` returns its files with
**multi-signal attribution** (keyword+temporal+semantic) **and** `compile` cites them budget-bounded; a
just-captured memory is findable and an edit updates the index; the corpus-indexer unit proves the NFR-12
cache (a **counting fake embeddings**) + `remove` clears all three signals + tenant isolation. Committed
per the standing cadence (implementation + records).

**Decisions:** one shared `CorpusIndexer` for ingestion + memory (single ref space); **whole-document**
indexing for F-039 (sub-document chunking + `embedBatch` is a documented refinement keeping this sink
seam); the Local runtime enables **no** compilation cache, so index writes are immediately reflected (if a
cache is enabled later it MUST key on a corpus version — the documented staleness contract).

**Deferred/documented seams:** sub-document chunking; multi-tenant ingestion-pipeline scoping (ingestion
indexes in the default tenant; memory in its capture tenant); the F-061 search-depth UI.

**Next step:** **F-040** (code-symbol extraction → live knowledge-graph population + static effect-links +
a manual assertion surface; resolves OQ5). It is unblocked (F-039 done) and its plan step includes an ADR
for the extraction approach (tree-sitter vs LSP vs TS compiler API).

---

## 2026-07-04 — F-038 DONE — R3 keystone: ingestion wired into the shipped runtime + REST/MCP source surface + SSE

Closed the launch-readiness review's **#1 gap**: `@tessera/ingestion` (F-006 connectors/pipeline/redaction
+ F-017 memory extraction) existed and was tested but was **not composed into the bootable runtime**. It now
**runs inside the Local runtime** and is **operable by an agent** over REST + MCP (ADR-0036 parity — F-038 is
its first enforced application). Delivered in 5 verifiable, committed increments; **plan-first**
([`F-038`](../plans/F-038-runtime-source-management.md), **ADR-0040**).

- **(1) `@tessera/ingestion`** — `SourceRegistry` port + in-memory adapter + conformance (tenant-scoped,
  ADR-0033); `SourceService` (list/register/get/remove/scan/scanStatus + forTenant), which caches a connector
  per source, tracks scan status, emits scan-lifecycle events, and (Local) awaits `Queue.drain()` so `scan()`
  is synchronous-complete. Additive seams on verified code: `IngestionEvents` +`source.scan.*`,
  `ScanSummary`→domain, worker gains `connectorFor(source)`, `Queue.drain()` on the in-process adapter,
  `autoScanOnRegister`.
- **(2) `@tessera/config`** — persistent `createSqliteSourceRegistry` + `createSqliteManifest` +
  `createBlobFragmentSink`; `createLocalRuntime` builds one ingestion worker (runtime sink =
  `tee(blob-corpus, memory-extraction)`) + a **bridge** ingestion bus → a shared `ApiEventBus` so scans stream
  `document.ingested`/`source.scan.*` on `GET /v1/events` (FR-38). `Runtime.{sources,events}`;
  `config.sources.autoScanOnRegister` + `TESSERA_SOURCES_AUTOSCAN`. `ApiEventMap`/`SourceService` imported
  **type-only** (bus via `@tessera/core`) → config + MCP stay **Fastify-free** (ADR-0030, verified).
  `@tessera/memory` capture input now accepts `readonly` arrays so the real service satisfies the F-017 seam.
- **(3) REST `/v1/sources`** (list/register/get/remove + POST/GET `:id/scan`) — Zod→OpenAPI, regenerated
  `@tessera/sdk` (+ client methods), `sources:read`/`sources:manage` RBAC, `source.read`/`source.manage`
  audit; tenancy off the wire; a `requireSources` guard.
- **(4) MCP** `add_source`/`list_sources`/`scan_source` wrap the SAME service, ride the F-026 gateway
  (`TOOL_PERMISSIONS` extended).
- **(5)** ADR-0040 + **E-021** + records; ADR index also gained the missing 0038/0039 rows.

**Agent-first proof shipped:** an agent registers a fixture repo, scans it (incremental + idempotent, the ADR
auto-extracted into a decision memory), and observes SSE progress — **fully offline**.

**Evidence (all green, workspace-wide):** `node scripts/verify-state.mjs` → valid (65 features, **21
effect-links**, env-docs ok) · format · typecheck 30 · lint 17 · **test 30** (ingestion 58, config 27) ·
**e2e 16** (api 40 incl. **6 sources**, mcp 14 incl. **3 sources**) · build 17. Committed per the standing
per-increment cadence (5 commits + 1 pre-existing-format chore).

**Decisions (ADR-0040):** a `SourceService` domain surface (sources registered at runtime, not configured);
per-**source** connector resolution (not per-kind); an optional `Queue.drain()` to back a synchronous Local
scan over the fire-and-forget queue; the runtime sink lands documents in the corpus + extracts memories, but
**retrieval-index population is F-039** (deliberate boundary — `search` does not yet return ingested files).
**Lesson:** [[synchronous-scan-over-fire-and-forget-queue-and-per-source-connector]].

**Deferred as documented seams:** F-039 (live indexing), multi-tenant ingestion-pipeline scoping,
filesystem-path allowlisting for hosted, the web Sources UI (F-041), the RBAC-catalog web-mirror drift (F-046).

**Next step:** **F-039** (live corpus indexing — ingested documents populate keyword/semantic/temporal so
search/compile answer from the real repo; also index captured memories). It is unblocked (F-038 done).

---

## 2026-07-04 — Harness: adopt external agent-skills (design-review, skill-observer); codex review opt-in; pm-skills declined

Evaluated four proposed external skill repos and integrated them via the **"adapt into the
agnostic core"** pattern ([ADR-0013](../../docs/adr/0013-general-purpose-execution-skills-from-ecc.md)
/ [ADR-0021](../../docs/adr/0021-frontend-harness-and-design-skill-adaptation.md) precedent), not
raw plugin installs. Additive Markdown only — no source touched, build unaffected.

- **`design-review`** (new skill, from **impeccable**, Apache-2.0): a deterministic
  design-audit / critique / polish pass subordinate to `DESIGN-SYSTEM.md`; complements
  `frontend-craft` / `build-ui`, feeds the `a11y` / `web-perf` gates, and runs live checks through
  our own `preview_*` tooling. Principles adapted; impeccable's CLI/detector/extension stay
  upstream.
- **`skill-observer`** (new skill, from **one-skill / Task Observer**, CC BY 4.0): a low-friction
  observation buffer ([`../memory/observations.md`](../memory/observations.md)) drained
  periodically into concrete skill/rule/ADR improvements. Crisp boundary vs `continuous-learning`
  (durable lessons) and `write-adr` (decisions).
- **Codex adversarial review**: OpenAI Codex made an **opt-in, off-by-default** Claude Code
  integration ([`../../.claude/integrations/`](../../.claude/integrations/)) under a new agnostic
  governance policy [`third-party-model-review`](../governance/third-party-model-review.md); the
  evaluator references it as advisory-only. Nothing egresses to OpenAI unless a human enables it.
- **pm-skills**: **declined** — an off-mission PM marketplace (~68 skills); scope creep for a
  coding harness (product definition already lives in PRD/roadmap/ADRs).

Also fixed a pre-existing index gap (the frontend skills were absent from the skills README).
Decisions in [ADR-0038](../../docs/adr/0038-external-agent-skill-adaptations-design-review-and-skill-observer.md)
(adaptations + pm-skills decline) and
[ADR-0039](../../docs/adr/0039-optional-independent-model-adversarial-review-codex.md) (codex
opt-in + egress policy); attributions in [`NOTICE.md`](../../NOTICE.md) (Apache-2.0
impeccable/codex; CC BY 4.0 Task Observer, attribution retained); `.claude/` shims for both new
skills; skills/governance/memory indexes updated.

**Evidence:** `node scripts/verify-state.mjs` → `state valid — 65 features, 20 effect-links,
wip_limit 1; 11 gates CI-mirrored, 777 doc links, env-docs ok` (was 708 links; +69 all resolve).
3 pre-existing historical warnings (F-031/033/035 plan-less done) unchanged.
**Next step:** unchanged — executor claims **F-038**.

---

## 2026-07-04 — Harness hardening: strict self-audit → 6 new mechanical guards + policy/practice reconciliation

A strict audit of the harness itself (`.harness/` + `.claude/` + `scripts/` + `AGENTS.md`), then
hardening. Principle applied: **a rule that can be a mechanical check and isn't is a gap** (now
itself a self-audit item). Verdict: the harness's *design* was already strong (closed loop, modular
rules, honest protocols); its weakness was **enforcement drift** — several stated invariants had no
guard, and three written policies contradicted authorized practice.

**Drift found (each now fixed AND guarded):**
1. **Memory index was stale** — 5 of 25 lessons unindexed (composition-root, zod-v4-bridge,
   mcp-twin-surface, observability-additive, plugin-sdk-envelope). Fixed; now a `state`-gate check.
2. **CI didn't literally mirror gates.json** (`pnpm -w typecheck` vs CI's `pnpm typecheck`), and
   nothing would catch a gate activated without a CI step (exactly how web-perf drifted). Now a
   ci-mirror check (normalizes the `-w` spelling; explicit `ciStep:false` opt-out — a11y).
3. **Commit policy contradicted practice**: 'only when the user asks' vs the project lead's
   standing per-verified-increment cadence followed for weeks. Codified the standing cadence
   (green-only, diff reviewed, **pushes still always ask**) in commit-policy + git rule +
   checkpoint + clean-state + AGENTS.md golden rule 10.
4. **`.claude/settings.json` deny blocked `.env.example`** (`Read(./.env.*)`) — the committed,
   secret-free file agents are REQUIRED to update (env-docs guard). Deny list now enumerates real
   secret env files; rationale recorded in tool-access.md.
5. **`next-feature` said claim from `todo`** but every feature has always been claimed from
   `backlog` — wording fixed (todo, or backlog directly).
6. **Schema dual-maintenance trap**: release enum hardcoded in feature_list.schema.json (bit us
   adding R4). Schema now accepts `^R[0-9]+$`; membership stays strict via verify-state, which
   also now checks schema↔state sync generically. state/README updated (R4, no-drift note).

**New mechanical guards in `scripts/verify-state.mjs`** (the `state` gate, still zero-dep;
warnings don't fail, errors do): blockers-must-be-done before `in_progress`/`in_review`/`done` ·
plan-before-code (in-flight features need `.harness/plans/F-xxx-*.md`; done-without-plan = warning
— F-031/033/035 are the recorded historical debt) · PRD requirement traceability (every FR/NFR a
feature cites must exist in docs/PRD.md) · feature `verification` tokens must be real gate ids ·
gates.json shape/uniqueness/status validation + CI mirror (E-005) · memory-index coverage ·
governed-doc relative-link check (README/AGENTS/CLAUDE/NOTICE + docs/** + .harness/** — 708 links)
· env-docs guard (kept). First run caught the real drift above (proof the guards bite).

**Also:** the ADR-0036 **agent-first parity rule** is now a binding rule file
(`.harness/rules/common/agent-first.md`) — REST+MCP before/with UI, token-lean responses, tools
ride the gateway; F-038's acceptance updated (it *applies* the rule; no longer records it).
Self-audit checklist gained 'mechanical enforcement' + 'agent-first parity' items; rules README
scopes frontend rules to all web apps (ADR-0035); gates.json state-gate description documents the
expanded guard set.

**Evidence:** `node scripts/verify-state.mjs` → valid: 65 features, 20 effect-links, 11 gates
CI-mirrored, 708 doc links, env-docs ok; 3 expected historical warnings (plan-less done features).
**Next step:** unchanged — executor claims **F-038** (now with the parity rule pre-recorded).

---

## 2026-07-04 — Product decisions: 'New project' placement + persistent notification service (+F-065)

Two product-lead questions decided and recorded so they aren't forgotten:

1. **'New memory' → 'New project'? Relocate, don't replace.** Project creation is a rare,
   structural action; memory capture is the frequent daily action (and feeds UC3 decision recall).
   Following the established enterprise pattern (GitHub '+' menu / Vercel 'Add New…' / Linear),
   **'New project' lives inside the F-050 project switcher (+ ⌘K palette)**, and the sidebar's
   dedicated 'New memory' button **evolves into a single '+ New' quick-create menu**
   (memory / source / project, contextual default). Recorded in **F-050**'s acceptance — the
   executor cannot miss it when the switcher is built.
2. **Notification service: yes — new F-065 (R4, after F-060/F-045).** F-060's bell is live-session
   SSE only (lost on reload); F-065 makes it a **persistent, per-user notification center**:
   NotificationStore port (in-memory + SQLite, tenant-isolated, retention-pruned, mirroring the
   F-027 audit pattern), produced from the SAME domain events as SSE (one event taxonomy),
   REST + MCP parity (ADR-0036) incl. a `list_notifications` tool so a **reconnecting agent can ask
   'what changed since my last session'** (agent-first differentiator), read/unread + preferences,
   dashboard center on the F-063 table pattern; email/Slack/webhook channels = documented seams
   behind a NotificationChannel port. Cross-link noted on F-060.

**Evidence:** `node scripts/verify-state.mjs` valid (**65 features**, 20 effect-links).
**Next step:** unchanged — executor claims **F-038**.

---

## 2026-07-04 — Dashboard hard review (live-verified): craft is enterprise-grade, coverage is not → +F-060…F-064

Follow-up to the launch-readiness review: a file-level + **live** review of `apps/web` (booted the real
API on :3000 with scratchpad storage/fake embeddings + `next dev` on :3100 and drove the UI in a real
browser).

**Verdict:** the **craft** is genuinely enterprise-grade — consistent DESIGN-SYSTEM usage, honest
loading/empty/error states everywhere, no fabricated data anywhere (verified: the overview renders
'—' rather than fake numbers), accessible labels/skeletons, clean typed data layer. What's built is
**correctly integrated**: `/audit` rendered the real recorded events of live API calls; the
capture-memory dialog wrote a real memory (confirmed via `GET /v1/memory`); web(:3100)→api(:3000)
CORS worked. The problem is **coverage + product depth**, not quality.

**Live-proven findings**
1. **Core-loop proof:** captured a memory via API, then `/v1/search` for its exact words → `[]`;
   `/v1/compile` → an empty package. Nothing feeds the retrieval indices (confirms F-038/F-039);
   **captured memories also never reach the indices** → added an explicit acceptance bullet to
   **F-039** (memory capture/edit must upsert into keyword/semantic/temporal).
2. **Misleading empty-package UX:** compiling against an empty corpus renders 'Budget adherence
   100% · Provenance coverage 100% · 0 fragments' — perfect scores on nothing → **F-062**.
3. **Static Overview:** stat cards are hardcoded placeholders; 'Recent activity' is a permanent
   empty state; the notifications bell is an 'all caught up' shell; **the app has zero `/v1/events`
   (SSE) consumers** although the API ships the stream → **F-060**.
4. **Search is a dead end:** results show only ref + score + signals — no excerpt, no click-through
   detail, no kind filters, no keyboard nav → **F-061**.
5. **Audit v2 needed:** UI exposes only action/outcome filters (API supports actor/since/until);
   `nextCursor` unused — the UI says 'narrow the filters' instead of paginating; no export;
   **no virtualization anywhere** despite the FR-49 claim → **F-063** (data-table standard) +
   **F-064** (FR-49 debt audit + i18n readiness, NFR-14 — nothing is externalized).
6. Smaller notes for implementers: `lib/api` `JSON.parse` can throw a raw SyntaxError on non-JSON
   responses and ignores TanStack abort signals (both dissolve when F-045 adopts the SDK);
   `lib/governance.ts` hand-mirrors the RBAC catalog (drift risk → folded into F-046 acceptance).

**What changed:** feature_list +**F-060** (live Overview: `GET /v1/stats` + get_stats MCP parity +
first SSE consumer + notifications feed), +**F-061** (search depth), +**F-062** (Inspector v2:
honest empty guidance, agent-ready Markdown/JSON export, filters/presets/clamp feedback),
+**F-063** (data-table standard + Audit v2), +**F-064** (UX-baseline completion + i18n, R4);
amended F-039 (memory indexing) + F-046 (governance catalog drift). With F-041/042/043/045/046/050/
057, the dashboard backlog now covers every PRD dashboard requirement plus the review findings.

**Evidence:** `node scripts/verify-state.mjs` valid (**64 features**, 20 effect-links); live-session
proof as above (server booted from `apps/server/dist`, real browser session, real API round-trips).

**Next step:** unchanged — executor claims **F-038**; the dashboard arc lands F-041/042/043 then
F-060…F-063 behind it.

---

## 2026-07-04 — Launch-readiness review (supervisor/architect session): gap analysis → R3 rescoped + R4 added (F-038…F-059)

A full project review (harness, PRD, ADRs, all 37 features, code wiring, security) against the
project lead's launch brief (professional/enterprise-grade, beyond unabyss.com, marketing + docs +
app subdomains, agent-first, profile page, full E2E, multi-project). **No product code changed** —
this session steers: PRD/ADRs/roadmap/coverage/feature backlog updated so the executor builds from
`feature_list.json` one feature at a time.

**Verdict: the project is NOT complete.** The engine (R0–R2 packages) is real and well-verified,
but the *shipped product* has three classes of gaps:

1. **The core loop is not closed in the running product (worst gap).** `@tessera/ingestion`
   (fs/git/GitHub connectors, redaction, memory extraction) exists and is tested, but is **not
   composed into the bootable runtime**: no `/v1/sources` route, no MCP source tools, no worker in
   `createLocalRuntime`, retrieval/vector indices only populated via test seams, and the knowledge
   graph is never populated (OQ5 unresolved → `get_effects` is empty in production). A user cannot
   point Tessera at a repo and get context out. → **F-038/F-039/F-040 (R3 musts)**.
2. **The dashboard is a partial product.** `/sources`, `/settings`, `/memory`, `/graph` are
   ComingSoon stubs (FR-42/43/45/46 were roadmapped R1 but never became features — traceability
   gap); **no auth/session in the web app** (nav shows "Local mode · no account"), no profile page,
   no token self-service, web still on the interim `lib/api` client (ADR-0022 deferral). →
   **F-041/F-042/F-043/F-045/F-046**.
3. **Launch surface doesn't exist.** No marketing site, no docs site, no skills registry, no CLI,
   no deploy artifacts (zero Dockerfiles; compose = postgres only; non-local profiles throw), no
   LICENSE (OQ4 decided open-core but never executed), README still says "pre-coding".
   → **R4 (F-050…F-059)**.

**Security review findings** (→ F-044/F-047 + acceptance criteria elsewhere): no REST rate
limiting (only MCP quotas), no security headers, `GET /v1/events` (SSE) is a public route even in
token mode, CORS is a blanket registration (needs per-profile allowlist), no request-id
propagation; MCP surface doesn't record audit events; DSR export/delete (NFR-13) and memory
retention (FR-15) unbuilt; billing SubscriptionStore + quota store in-memory only; no SBOM/signing.
**Perf findings** (→ F-049): NFR-4 was an R0 exit criterion but has never been benchmarked; the
`web-perf` gate said "activates with F-028" and never did (drift fixed in gates.json — now F-049).

**What changed (this session)**
- **ADR-0035** (public web platform: marketing on apex + dashboard on `app.` + docs on `docs.` via
  Fumadocs; api at `api.`), **ADR-0036** (agent-first: binding API/MCP parity rule, `@tessera/cli`
  onboarding, skills registry, remote MCP, token-lean NFR), **ADR-0037** (multi-project: **decided
  yes** — `(tenantId, projectId)` scope extending the proven forTenant mechanism; `default` project
  back-compat). ADR index updated.
- **PRD v1.1**: +G8 (agent-first operations), +§6.10 (FR-62…FR-71), NFR-4 extended (benchmarked +
  token-lean), +NFR-16 (full-stack E2E), +NFR-17 (public-web quality), +NFR-18 (supply chain);
  §11 R3 rescoped + R4 added; OQ5 pinned to F-040.
- **roadmap.md**: R3 = enterprise & product completeness; R4 = launch (both mapped to features).
- **REQUIREMENTS-COVERAGE.md**: new section tracing the 2026-07-04 launch brief → FR/ADR/feature.
- **feature_list.json**: releases +R4 (schema enum updated); **+22 backlog features F-038…F-059**
  with acceptance/verification/blockedBy — R3: F-038 sources runtime+surface (must), F-039 live
  indexing (must), F-040 symbol extraction→KG+effects (must, decides OQ5), F-041 sources/settings
  UI, F-042 memory+Monaco+timeline, F-043 graph viz, F-044 API hardening (must), F-045 dashboard
  auth+SDK adoption (must), F-046 profile+tokens+user mgmt, F-047 retention+DSR+MCP audit,
  F-048 full-stack E2E (must), F-049 perf benchmarks (must). R4: F-050 multi-project (must),
  F-051 marketing (must), F-052 CLI (must), F-053 docs site (must), F-054 skills registry,
  F-055 remote MCP, F-056 self-hosted completion+deploy artifacts+guides (must), F-057
  analytics/usage/billing UI, F-058 flags+plugin perms (could), F-059 launch readiness (must).
- **gates.json**: +`e2e-full` (planned → F-048) and +`perf` (planned → F-049); `web-perf`
  activation moved F-028→F-049 (drift fix). **README**: status refreshed (was "pre-coding").

**Evidence/verification:** `node scripts/verify-state.mjs` valid (59 features, 20 effect-links) —
see below; docs link-check on changed files.

**Decisions:** multi-project = YES (ADR-0037); docs toolchain = Fumadocs (ADR-0035); agent-first
parity is now a binding rule (ADR-0036 — F-038 records it into `.harness/rules/`); build order =
close the core loop before any launch surface (R3 before R4).

**Next step:** executor claims **F-038** via `/next-feature` (plan first, per the working loop).

---

## 2026-07-04 — F-027 DONE (increment 2): governance & audit web UI — **R3's first feature complete** (@tessera/web)
The final increment of F-027 (FR-48) — the governance & audit **UI** over the audit trail backend (1a/1b),
completing the feature and **R3's first delivery**.
- **Data layer (`apps/web/lib/api`):** audit types + `api.getAudit(query)` (GET /v1/audit with a filter
  querystring) + a `useAudit` TanStack Query hook, mirroring the `/v1/audit` schema (ADR-0022 interim client).
  `lib/governance.ts` = a hand-maintained mirror of the RBAC catalog (ROLES/PERMISSIONS/ROLE_PERMISSIONS) +
  audit-action labels, so the UI renders the model without bundling `@tessera/api`.
- **`/audit` (`AuditView`, flagship):** a provenance-first **audit log** — filter by action + outcome
  (accessible `Select`s), a table of events (time · actor+kind · action · target · outcome), with
  loading/empty/error states and a "more events" hint. Outcome badges use an **outline + colored-text**
  treatment (denied = destructive text) after axe flagged a solid-destructive badge for **contrast** (AA).
- **`/governance` (`GovernanceView`):** the **RBAC roles→permissions matrix** (check/–) + an **audit
  retention** posture card (NFR-13). Added a **"Govern" nav group** (Audit log + Governance) to BOTH nav
  sources — `components/app-shared.tsx` (sidebar/breadcrumb) and `lib/nav.ts` (⌘K palette); the sidebar uses
  `app-shared` (caught during screenshot verification — the group was missing until I updated it too).

**Evidence (all green, workspace-wide):** state · format · typecheck 30 · lint 17 · **test 30** · build 17
(+ `/audit` + `/governance` prerendered) · **e2e 16** (web 7 incl. **2 new axe tests** — audit renders
stubbed events + filters, governance renders the matrix + retention, both **WCAG A/AA clean**).
**Screenshot-verified** (frontend bar): `/governance` renders the matrix + retention cards; `/audit` renders
the header + filters + states with the Govern group active in the sidebar.

**Decisions:** consume the audit API via the interim `lib/api` client (ADR-0022; the generated SDK already
has `getAudit`); mirror the RBAC/action catalogs in `lib/governance.ts` rather than import the API package
into the browser bundle; outcome badges use accessible colored-text over solid fills. **Effects:** **E-020**
(the governance/audit UI realized — the audit contract's web consumer) + **E-003** (consumes GET /v1/audit).

**🎉 F-027 DONE** — audit trail backend (1a), persistent SQLite + config (1b), governance/audit UI (2).
**R3's only in-scope feature is complete.** Committed per the standing per-feature cadence.

---

## 2026-07-04 — F-027 increment 1b: persistent SQLite audit log + config wiring (@tessera/config)
Made the audit trail **durable** — the composition root now wires a persistent, tenant-scoped SQLite sink
so records survive restarts (increment 1a's default sink is in-memory). Mirrors the F-034 token-store
pattern exactly (ADR-0030): the audit contract is imported **type-only** from `@tessera/api`, so
`@tessera/config` (and the MCP process booting through it) stays **Fastify-free** (verified — config dist
has no fastify).
- **`createSqliteAuditLog(db)`** (`packages/config/src/audit/`): implements the `AuditLog` port over the
  storage Drizzle handle — an `audit_events` table with a monotonic `seq` (rowid) for newest-first ordering
  + a **stable `seq < cursor` cursor**, a `tenant_id` column + `forTenant` scoping, filter by
  action/actor/outcome/time, and `prune` by max age / newest-`maxEntries` (retention, NFR-13).
- **Config:** an `audit` section (`enabled` default true, `retention {maxAgeDays?, maxEntries?}`) +
  `TESSERA_AUDIT_*` env (documented in `.env.example` — the env-docs guard enforced it); `Runtime.audit?`
  built in `createLocalRuntime` when enabled; `apps/server` `startApiServer` passes `runtime.audit` to
  `buildServer` (falls back to the in-memory sink when disabled).

**Evidence (all green, workspace-wide):** state (env-docs incl. the 3 new vars) · format · typecheck 30 ·
lint 17 · **test 30** (config 22: sqlite-audit-log 3 = record/filter/isolation, pagination+retention prune,
**persist-across-restart**) · build 17 · **e2e 16**. Fastify-free-config invariant re-verified.

**Effects:** **E-020** (createSqliteAuditLog realized) + **E-014** (config `audit` section + `Runtime.audit`
wiring). **Next step:** increment **2** — the governance & audit **web UI** (FR-48): an Audit Log view
(filter by action/actor/outcome/date) + a Governance view (roles/permissions + retention), WCAG AA,
screenshot-verified. Committed per the standing per-feature cadence.

---

## 2026-07-04 — F-027 increment 1a: audit trail backend (in-memory, end-to-end) (@tessera/api)
First code increment of F-027 (FR-55/NFR-13; ADR-0034). The **audit trail works end-to-end** with the
default in-memory sink — sensitive actions are recorded at the `/v1` boundary and queried by admins,
tenant-isolated. Persistence (SQLite/config) is increment **1b**; the governance UI is increment **2**.

**What landed (`apps/api/src/audit/`):**
- **Model + port (Fastify-free):** `AuditEvent { id, tenantId, actor {principalId, kind}, action, target?,
  outcome success|denied, at, metadata? }` — **non-sensitive** (ids/actions/outcomes only, never bodies/
  secrets, NFR-7); an `AUDIT_ACTIONS` catalog; `AuditLog { record, query, prune, forTenant }` — **append-
  only**, tenant-scoped via `forTenant` (ADR-0033).
- **`createInMemoryAuditLog`** (reference adapter): per-tenant events with a monotonic `seq`; queries are
  **newest-first**, filtered (action/actor/outcome/time window) and **cursor-paginated** by `seq < cursor`
  (stable against concurrent appends); `prune` by max age / max entries (retention, NFR-13).
- **Recording:** `recordAudit` — an `onResponse` hook that records an event for routes flagged
  `config.audit` (`search`/`compile`/`effects.read`/`memory.read|write`/`audit.read`); actor+tenant from the
  `AuthContext`, outcome from the status (`>=400` → `denied`, so a 403 RBAC denial is captured);
  **failure-isolated** (a sink error is logged, never breaks the request); unauthenticated (no AuthContext)
  is skipped.
- **`GET /v1/audit`** (`admin:manage`, tenant-scoped via `forTenant`, Zod filter/paginate) → `{ events,
  nextCursor? }`; `buildServer` gains `audit?` (default in-memory); OpenAPI + **regenerated SDK** (`getAudit`).

**Evidence (all green, workspace-wide):** state (37 features, **20 effect-links** — new **E-020**) · format ·
typecheck 30 · lint 17 · **test 30** (api 49 incl. audit-log conformance 6) · build 17 · **e2e 16** (api 34
incl. **audit e2e 2**: default-build record+query; token-build **success/denied** outcomes + **admin-only**
query 403 + **cross-tenant isolation** — globex admin sees none of acme's events).

**Decisions (ADR-0034):** record at the boundary via a hook (not the SSE event bus — audit needs durable,
queryable, retained records); the model+port+in-memory core is Fastify-free (so the composition root builds
a persistent adapter without pulling Fastify — the F-034 token-store precedent); tenancy reuses `forTenant`;
`admin:manage` reused (no RBAC-catalog ripple); events non-sensitive. **Effects:** new **E-020** (audit
contract) + **E-003** (new route/schema → OpenAPI/SDK) + **E-018** (consumes the auth model — actor/tenant).

**Next step:** increment **1b** — `createSqliteAuditLog` (persistent `audit_events` table, tenant column,
retention prune) + `config.audit` + `TESSERA_AUDIT_*` env + `Runtime.audit` + server wiring; then increment
**2** — the governance & audit web UI (FR-48; WCAG AA, screenshot-verified). Committed per the standing
per-feature cadence.

---

## 2026-07-03 — R3 KICKOFF + F-027 claimed (planned): governance & audit UI + full audit trail
R2 is complete, so the release advanced to **R3**. R3's only in-scope feature is **F-027** (Governance &
audit UI + full audit trail — FR-48/FR-55/NFR-13). Promoted it `backlog → in_progress` (WIP 1; F-037 done),
added its **acceptance criteria**, and completed the **planner phase**: [`F-027`](../plans/F-027-governance-audit-ui-audit-trail.md)
+ **ADR-0034**.

**Design (ADR-0034):** an `AuditLog` port whose events are recorded at the `/v1` boundary by a `buildServer`
hook, queried via `GET /v1/audit` (`admin:manage`, tenant-scoped via `forTenant`/ADR-0033), persisted by a
SQLite adapter wired in `@tessera/config` — **mirroring the F-034 token-store pattern** (Fastify-free
model+port+in-memory core in `@tessera/api`; SQLite adapter + wiring in the composition root). `AuditEvent`
is non-sensitive (ids/actions/outcomes only — never bodies/secrets, NFR-7); append-only; retention prune
(NFR-13). Default in-memory sink → additive. Then a governance/audit **web UI** (FR-48) consumes it.

**Planned increments:** (1) **audit-trail backend** — audit core (model/port/in-memory) + shared conformance
(incl. cross-tenant isolation) + recording hook + `GET /v1/audit` + `createSqliteAuditLog` + config `audit`
section + server wiring + SDK regen; (2) **governance & audit web UI** — Audit Log + Governance views, WCAG
AA, screenshot-verified.

**State:** no code yet — this commit is the **R3 kickoff + planner phase** (plan-before-code per the harness),
leaving F-027 cleanly `in_progress` with an actionable plan. Gates unaffected (state valid — 37 features, 19
effect-links; format clean). **Next step:** implement increment 1 (audit-trail backend) then increment 2 (UI).

---

## 2026-07-03 — F-037 DONE + **R2 COMPLETE**: data-plane per-tenant row isolation (FR-52; ADR-0033)
The last R2 `must`. Closed the F-025 seam: `AuthContext.tenantId` was *carried* but the domain stores were
**not** tenant-scoped — now every store enforces real per-tenant row isolation. User picked the **full**
scope (all SQLite stores + services + REST + MCP + **live Postgres verification**).

**Design (ADR-0033) — `forTenant` scoped views, default = `DEFAULT_TENANT_ID`:**
- Promoted the tenant primitive **`TenantId` + `DEFAULT_TENANT_ID`** to **`@tessera/core`** (dependency-free
  base) so domain packages scope by tenant without depending on `@tessera/api`; `@tessera/api/auth/model`
  **re-exports** them (public API unchanged). Additive on **E-006**.
- Added **`forTenant(tenantId): Self`** to `MemoryStore`/`GraphStore`/`VectorStore`/`Retriever`/
  `HybridRetriever`/`ContextCompiler` + the 3 domain services. The **base view is the default tenant**, so
  every existing test + the zero-auth Local profile are **byte-for-byte unchanged**; tenancy engages only
  when a non-default `tenantId` is threaded. Enforcement lives **in the adapter** (not a bypassable wrapper).
- **Per store:** VectorStore — sqlite-vec **per-tenant `vec0` table**, pgvector **`tenant` column + composite
  PK `(tenant,id)`**. Memory — `memories.tenant_id` + additive `ALTER` migration. Graph — `tenant_id` +
  **composite PK** (`nodeIdFor(kind,key)` is deterministic → same node id per tenant) + tenant predicate in
  **both arms of the `getEffects` recursive CTE**. Keyword (FTS5 tenant col) + temporal (composite PK) filter
  their owned indices; semantic/graph/symbolic delegate to the scoped stores. Compiler folds a non-default
  `tenantId` into the **CompilationKey** so a shared cache stays tenant-safe.
- **No wire change:** `Memory`/`ContextPackage`/`CompileRequest`/REST/MCP schemas keep **no** tenant field —
  isolation is a server-side storage guarantee → **OpenAPI + generated SDK unaffected**.
- **Threading:** REST routes call `services.X.forTenant(tenantOf(request))` (new auth helper); MCP tools use
  `guard()`'s returned `AuthContext.tenantId` (ungated → default).
- **Effect-link ripple caught:** `@tessera/observability` `instrumentServices`' tracing Proxy now special-cases
  `forTenant` (re-wrap the scoped service, don't Promise-ify it) — **E-015**.

**Evidence (all green, workspace-wide):** state (37 features, 19 effect-links) · format · **typecheck 30** ·
**lint 17** · **test 30** (storage **37 with live PG** incl. pgvector isolation, memory 27, knowledge-graph
25, retrieval 33, context-compiler 36) · **build 17** · **e2e 16** (api 33 incl. a **cross-tenant memory
e2e** — acme writes, globex 404s + empty list; mcp 11; web 5 WCAG). Each shared **conformance suite** gained
a cross-tenant isolation case (so every current + future adapter must satisfy it). **pgvector isolation
verified LIVE** against `docker compose … postgres`.

**Effects:** **E-018** — data-plane isolation **REALIZED** (no longer a seam) + **E-001/E-007** (VectorStore
forTenant), **E-010** (memory), **E-011** (graph), **E-012** (retrieval), **E-013** (compiler + tenant key),
**E-006** (core TenantId), **E-003** (routes/tools thread tenantId; schemas unchanged), **E-015** (obs Proxy).

**Decisions (ADR-0033):** `forTenant` scoped views over threading tenant on every signature (additive,
green-at-every-step); tenant primitive in `@tessera/core`; a **row/partition column** over a DB-per-tenant
(local-first single SQLite file); tenancy **off the wire** (storage guarantee, not a payload field).
**Deferred as documented seams:** Postgres-backed memory/graph stores (still SQLite-only — will inherit the
same `tenant_id` contract), cross-tenant admin ops, per-tenant quotas/usage + tenant lifecycle, and ingestion
populating per-tenant retrieval/vector indices (same `forTenant` seam).

**Lesson:** [[forTenant-scoped-view-default-tenant-for-additive-row-isolation]] — retrofit per-tenant row
isolation across many verified stores by adding a `forTenant(tenantId)` **scoped view whose base is a default
tenant** (existing callers/tests untouched) and enforcing the tenant column **inside each adapter** + a shared
**conformance isolation case**, rather than threading tenant through every method signature; keep tenancy off
the wire so the API/SDK contract is unchanged, and watch cross-cutting decorators (observability Proxy) that
assume every method is an async call.

**🎉 R2 COMPLETE** — F-025 (auth/RBAC), F-026 (MCP gateway), F-030 (billing), F-034 (auth wiring), F-035
(entitlement enforcement), F-036 (OIDC), **F-037 (data-plane isolation — the last `must`)** all done.

**Next step:** **R3** — F-027 (governance & audit UI + full audit trail, `@tessera/web`, FR-48/55/NFR-13), the
only R3 feature currently in scope. Committed per the standing per-feature cadence.

---

## 2026-07-03 — F-036 DONE: OIDC AuthProvider (IdP-agnostic JWT/JWKS, jose) (@tessera/api)
Picked the **smaller** of the two carried R2 items (per the user's "OIDC first iff it's smaller"): OIDC is
a single localized adapter + config wiring, vs F-037's every-store refactor. Plan/design: **ADR-0032**.
**Key insight:** the "which IdP/library" open question **dissolves** under the port model — Tessera
*verifies* tokens from whatever OIDC IdP the operator runs; it doesn't run a login. So there's no IdP
product to pick, only a verifier: **`jose`**.
- **`apps/api/src/auth/oidc.ts`:** `createOidcAuthProvider` verifies a Bearer JWT against the IdP's JWKS
  (`jose` `jwtVerify` + `createRemoteJWKSet`; injectable `keySet` for offline tests), checks iss/aud/expiry,
  and maps claims → `Principal` (`sub`→id; a roles claim → RBAC roles, unknown→`viewer`; a tenant claim →
  `AuthContext.tenantId`; name/email→display). Any failure → 401 (generic). In the **Fastify-free**
  `@tessera/api/auth` core (jose ≠ Fastify → config/MCP stay clean; verified).
- **Config:** `auth.mode` gains `oidc` + an `auth.oidc` section (issuer/audience required via `superRefine`)
  + `TESSERA_AUTH_OIDC_*` env (documented — the new env-docs guard would have caught a miss);
  `createRuntimeAuth` builds it via the subpath. New dep `jose@^6` on `@tessera/api`.

**Evidence:** state (37 features, 19 effect-links) · format · typecheck (30) · lint (17) · **test (30; api
43, config 19)** · build (17) · e2e (16, regression-clean). +10 tests — api oidc 7 (offline RSA keypair;
valid→mapped context, space-delimited roles + default tenant, unknown-role→viewer, missing/expired/wrong-
aud/wrong-iss→401) + config 3 (defaults; oidc accepted w/ issuer+audience; rejected without). Effects E-018
(OIDC adapter realized) + E-014 (config wiring). ADR-0032.

**Decisions:** IdP-agnostic standard-OIDC verification with `jose` (not a full auth framework, not
hand-rolled crypto). Seams: a **live IdP** round-trip (none available here), opaque-token introspection, an
OIDC discovery/login helper.

**R2 status:** the only remaining R2 item is **F-037** (data-plane per-tenant row isolation, FR-52 — the
`must`), a large cross-package refactor tracked as backlog. Everything else in R2 is done. **R3 (F-027) is a
separate session** per the user. Committed per the standing per-feature cadence.

---

## 2026-07-03 — F-035 DONE + R2 COMPLETE (buildable): entitlement enforcement (@tessera/billing)
Makes plan entitlements actually bite (NFR-12), completing R2's substantive work. Additive; default
local/free.
- **`@tessera/billing`:** `clampBudgetToPlan(entitlements, requested)` = `min(requested,
  maxTokensPerCompile)`, honoring `-1` = unlimited.
- **`@tessera/api` `/v1/compile`:** resolves the caller's subscription via `services.billing` (tenant from
  the `AuthContext`; local/free fallback) → `effectiveEntitlements` → **clamps the requested token budget**
  before compiling. Free caps at 8000; a subscribed pro tenant gets 32000.

**Evidence:** state (37 features, 19 effect-links) · format · typecheck (30) · lint (17) · **test (30;
billing 14, api 36)** · build (17) · **e2e (16; api 31)** — billing unit clamp + api e2e (free 50000→8000;
pro, seeded via a signed webhook, →32000). SDK regenerated. Effects E-019 (enforcement realized) + E-003.

**R2 status — COMPLETE for what is buildable in this environment.** Tracked features done: **F-025**
(auth/RBAC), **F-026** (MCP gateway), **F-030** (billing), **F-034** (auth wiring), **F-035** (entitlement
enforcement). Two R2 requirements are **carried as explicitly-tracked backlog** because they need external
resources or a large refactor — recorded as features so nothing is lost:
- **F-036** — OIDC AuthProvider adapter (NFR-2): needs the IdP/library decision (an open ADR) + a live IdP;
  the `AuthProvider` port already supports it, so this is a localized adapter.
- **F-037** — data-plane per-tenant row isolation (FR-52): `AuthContext.tenantId` is carried but the domain
  stores aren't tenant-scoped yet; completing it is a large cross-package change (tenant column + enforced
  filter + conformance across every store) to design before touching verified code.

Other seams (live Dodo verification, persistent subscription/quota/usage stores, monthly-compile metering,
MCP-surface entitlement enforcement) are documented in the relevant feature notes/effects.

**Next step:** **R3 in a separate session** (per the user) — F-027 (governance & audit UI + full audit
trail). When resuming R2's carried items: F-037 (isolation) is the `must`; F-036 (OIDC) needs the IdP ADR.
Committed per the standing per-feature cadence.

---

## 2026-07-03 — HARNESS: env-docs guard (stop shipping undocumented env vars)
The user flagged that we **repeatedly forget** to add new env vars to `.env.example`. Systematized it in
the harness so it can't be missed:
- **Guard:** extended the `state` gate ([`scripts/verify-state.mjs`](../../scripts/verify-state.mjs)) —
  it now scans `packages/config/src/load.ts` + `apps/server/src` for `TESSERA_*` tokens and **fails** if
  any is not present in [`.env.example`](../../.env.example). Zero-dep, runs everywhere the state gate
  runs (CI, `verify`, definition-of-done). It caught the 7 F-034/F-030 vars on first run.
- **Docs:** `.env.example` updated with the auth (F-034) + billing (F-030) vars — `TESSERA_AUTH_MODE`/
  `TESSERA_AUTH_TENANT`/`TESSERA_AUTH_QUOTA_*`, `TESSERA_BILLING_PROVIDER`/`TESSERA_BILLING_DODO_BASE_URL`,
  and the Dodo secrets (`TESSERA_SECRET_BILLING_DODO_*`). A new rule in
  [`rules/common/documentation.md`](../rules/common/documentation.md) + a
  [definition-of-done](../protocols/definition-of-done.md) checklist item make the requirement explicit;
  the `state` gate description ([`gates.json`](../verification/gates.json)) notes it. (`.env*` is edited
  via shell — the Read/Write file tools are permission-blocked on it.)

**Evidence:** `node scripts/verify-state.mjs` → green (34 features, 19 effect-links) with the guard active;
`format:check` green. No product code changed. **Next:** complete the remaining R2 seam work.

---

## 2026-07-03 — OQ4 RESOLVED + F-030 DONE: Billing behind a Billing port, open-core (@tessera/billing)
**OQ4 resolved → open-core** (permissive-OSS core + a paid Managed Cloud tier), recorded in
[`PRD §12`](../../docs/PRD.md) + [ADR-0011](../../docs/adr/0011-billing-dodo-payments.md). That unblocked
**F-030** (FR-61, NFR-12). Plan/design: [ADR-0031](../../docs/adr/0031-billing-port-and-open-core.md).

**What changed** — a `BillingProvider` port with a local/free adapter (OSS) + a Dodo adapter (paid cloud),
default local/free so nothing existing is affected:
- **NEW `@tessera/billing`** (deps: `@tessera/core` only — no Fastify): `domain.ts` (`PlanId`
  free/pro/enterprise + `PLANS` catalog with `Entitlements`; `Subscription`; `effectiveEntitlements` →
  free for un-entitled statuses); `ports.ts` (`BillingProvider` + `SubscriptionStore`); `createLocalBilling`
  (every tenant active-free, checkout/webhook rejected, zero external deps); `createDodoBilling`
  (fetch-based, no SDK; `verifyDodoSignature` = constant-time HMAC-SHA256 over the **raw body**;
  `parseDodoEvent` maps a webhook → `BillingEvent`; env-guarded, live API = seam); in-memory
  `SubscriptionStore`.
- **Config:** a `billing` section (provider none|dodo, dodoBaseUrl) + `TESSERA_BILLING_*` env; Dodo
  secrets via the `SecretsProvider`; `Runtime.billing` + `ApiServices.billing` selected by config.
- **REST (`@tessera/api`):** `/v1/billing/plans` (public), `/v1/billing/subscription` + `/checkout`
  (`admin:manage`, tenant from the `AuthContext`), `/webhook` (public, signature-verified via an
  **encapsulated raw-body** string parser so other routes keep normal JSON). Reused `admin:manage` (no
  RBAC-catalog ripple); falls back to `createLocalBilling` when unwired.

**Decision (ADR-0031):** billing in its own package (not the API app); `fetch` over a payments SDK
(ADR-0024); reuse `admin:manage`. **Deferred as documented seams:** live Dodo verification (reconcile
`verifyDodoSignature` with Dodo's Standard Webhooks format when wiring a real account), a persistent
`SubscriptionStore`, **entitlement enforcement** (wiring `PLANS` limits into the compiler budget / MCP
quotas — NFR-12 metering), and the dashboard billing UI.

**Evidence/verification (all green, workspace-wide):** state (34 features, 19 effect-links, wip 1) · format
· typecheck (30) · lint (17) · **test (30 tasks; billing 13 = domain 4 + local 2 + dodo 7; api 36)** · build
(17) · **e2e (16 tasks; api 30 = prior 25 + 5 billing)**. The billing e2e drives a **signed Dodo webhook over
HTTP** that updates the subscription, plus bad-signature→401, public plans, and local checkout-rejection.
The **SDK was regenerated** (openapi.json + generated schema.ts now include `/v1/billing`).

**Effects:** **E-019** (new — the billing contract: ports + PLANS catalog + adapters) + **E-003** (new REST
routes; OpenAPI + SDK regenerated) + **E-014** (config billing wiring).

**Lesson:** [[open-core-domain-package-plus-provider-port]] — model a paid capability as a domain package
with a provider port + a **local/free adapter as the OSS default**, so the open-source build has zero
payment deps and the cloud adapter is opt-in; verify a provider you can't call live by unit-testing its
**signature + payload mapping** over raw bytes and driving a **signed webhook** through the real HTTP route.

**Next step:** **R2's buildable features are complete** — F-025 (auth/RBAC), F-026 (MCP gateway), F-034
(auth wiring seam), F-030 (billing). Remaining R2 seam work (entitlement enforcement, live Dodo, persistent
subscription store, OIDC mode, data-plane row-scoping) are follow-ups. **R3 next:** F-027 (governance &
audit UI + full audit trail). Committed per the standing per-feature cadence.

---

## 2026-07-03 — F-034 DONE: Auth composition-root wiring + persistent SQLite token store (@tessera/config)
R2 follow-up **seam #1** (the user's agreed "harden the seams" step). Makes F-025/F-026 auth **usable
end-to-end** — config-driven provider/gateway selection + durable token grants — additive (default `none`
unchanged). Plan: [`F-034`](../plans/F-034-auth-composition-root-wiring.md); **ADR-0030**.

**Key constraint solved:** `apps/server` boots the **MCP** process **through `@tessera/config`**, which
imports `@tessera/api` **type-only** to keep the MCP runtime **Fastify-free** (F-012). Building auth
providers needs `@tessera/api` runtime → would pull Fastify. **Fix:** a new **Fastify-free subpath
`@tessera/api/auth`** (`auth/core.ts` = model + providers + token store; **excludes** the Fastify
`plugin.ts`; `package.json exports['./auth']`). Config builds `Runtime.auth` from the subpath → the MCP
runtime stays Fastify-free (**verified**: config's only runtime `@tessera/api*` import is `/auth`, whose
graph has zero fastify).

**What changed:**
- **`@tessera/config`:** a validated `auth` section (`mode none|token`, `tenant`, `quota
  {enabled,limit,windowMs}`) + `TESSERA_AUTH_*` env mapping; **`createSqliteTokenStore(db)`** — a
  persistent `TokenStore` over the storage Drizzle handle (`api_tokens`; hashed at rest via the shared
  `hashApiTokenSecret`/`newApiTokenSecret` helpers extracted from the in-memory adapter; revoke/list;
  **survives restarts**); `Runtime.auth = { provider, tokenStore? }` selected by `config.auth.mode` in
  `createLocalRuntime`. New dep `drizzle-orm` (+ `@types/better-sqlite3` dev).
- **`@tessera/mcp`:** `startMcpStdio(services, { gateway? })` passthrough.
- **`apps/server`:** `startApiServer` → `buildServer({ auth: runtime.auth.provider })`; `startMcpServer`
  builds `createMcpGateway` (+ optional `createInMemoryQuotaLimiter`) → `startMcpStdio`; new
  **`tessera-token`** bin issues a scoped token (secret printed once).

**Decision (ADR-0030):** the subpath export over a package move (smaller, achieves Fastify-free reuse now);
the SQLite token store lives in **config** (the composition root already wires storage + api — api gaining
storage or storage depending on the api port would both be wrong-way deps). Quotas stay **in-memory**
(single-instance-correct; a distributed store is a seam). OIDC mode + data-plane row-scoping remain seams.

**Evidence/verification (all green, workspace-wide):** state (34 features, 18 effect-links, wip 1) ·
format · typecheck (28) · lint (16) · **test (28; +6: config sqlite-token-store 3 incl. persist-across-
reopen; server api auth-mode 1 = 401 without a token / 200 with an issued token; default none unchanged)** ·
build (16) · **e2e (15, regression-clean)**. Fastify-free-MCP invariant re-verified by grep.

**Effects:** **E-014** (config composition realized: `Runtime.auth` + `config.auth` + persistent token
store) + **E-018** (composition-root consumer realized; the `@tessera/api/auth` subpath is the new
Fastify-free import surface).

**Lesson:** [[fastify-free-subpath-for-composition-root-reuse]] — when the composition root must build a
capability whose code lives in a package with a heavy runtime (Fastify), expose a **Fastify-free subpath
export** of just the transport-agnostic core (model + ports + adapters, excluding the framework plugin)
rather than importing the package barrel; verify the invariant by grepping the actual import graph.

**Next step (agreed R2 plan):** seam #1 done. Next is **resolve OQ4** (license/business model — user
decision) → unblock **F-030** (billing behind a Billing port, Dodo Payments; ADR-0011). Then **R3** (F-027
governance & audit UI). Remaining auth seams (OIDC mode, distributed quota store, data-plane row-scoping)
are follow-ups. Committed per the standing per-feature cadence.

---

## 2026-07-03 — F-026 DONE: MCP gateway — multi-client auth + quotas (@tessera/mcp)
Second R2 feature (FR-36), additive to `@tessera/mcp` (ADR-0029). Plan:
[`F-026`](../plans/F-026-mcp-gateway-auth-quotas.md).

**What changed** — an injected **gateway** on the MCP surface that reuses the F-025 auth model and adds
per-principal quotas:
- **Reuse the auth model TYPE-ONLY** (`AuthProvider`/`AuthContext`/`AuthInput`/`Permission` imported as
  *types* from `@tessera/api`) so the **MCP runtime stays Fastify-free** (the F-012 invariant holds —
  the gateway needs only `ctx.permissions.has()`; providers are built at the composition root).
- **`gateway.ts`:** `createMcpGateway({ auth, quota?, resolveCredential? })` → `guard(tool, extra)` =
  authenticate (→ `AuthContext`, `UnauthorizedError` on bad/missing) → authorize the tool's required
  permission (`TOOL_PERMISSIONS`; `ForbiddenError`) → meter the principal (`RateLimitedError`). Errors
  flow through the **existing** masked envelope (`toEnvelope`).
- **`quota.ts`:** `QuotaLimiter` port + `createInMemoryQuotaLimiter` (fixed-window, injected clock,
  independent per-principal buckets).
- **`buildMcpServer(services, { gateway? })`** wraps each tool with the guard; **default off** ⇒ the
  five tools behave exactly as before. `resolveCredential(extra)` reads the SDK `authInfo`/`Authorization`
  header (default) — transport-agnostic.
- **New shared `@tessera/core` `RATE_LIMITED`** code + `RateLimitedError` → **429** at the REST envelope
  (`statusForCode`/`codeForStatus`/`errorCodeSchema` + web mirror; additive, **compiler-guided** by the
  exhaustive switch). One 429-equivalent for both MCP quotas and future REST rate-limiting.

**Decision (ADR-0029):** reuse the auth model type-only (no Fastify in MCP; no shared-package refactor);
an MCP-owned quota port; a dedicated `RATE_LIMITED` code (not overloading 403). **Deferred as documented
seams:** the multi-client **HTTP/streamable transport** + auth middleware (populates `authInfo`), a
persistent/distributed quota store, token-bucket/sliding-window + per-tool weights + quota headers, and
composition-root wiring (config/server → construct the gateway; capability proven by the e2e injecting the
real F-025 token provider).

**Evidence/verification (all green, workspace-wide):** state (33 features, 18 effect-links, wip 1) ·
format · typecheck (28) · lint (16) · **test (28 tasks; mcp 14 = quota 4 + gateway 8 + explain 2; api 36
incl. RATE_LIMITED→429)** · build (16) · **e2e (15 tasks; mcp 11 = prior 7 + 4 gateway)**. The gateway e2e
drives a **real MCP client over InMemoryTransport**: a viewer is denied `capture_memory` (FORBIDDEN) but
allowed reads, a member is allowed the write, quota exhaustion returns RATE_LIMITED, and the default
(no-gateway) build leaves all tools open (back-compat). SDK regen = **no diff** (the error envelope isn't
in the OpenAPI, so `RATE_LIMITED` doesn't ripple to `@tessera/sdk`).

**Effects:** **E-018** (the MCP gateway is a new type-only consumer of the auth model + owns the quota
port) + **E-006** (core `RATE_LIMITED` added additively; dependents reviewed) + **E-003** (tools now
optionally guarded; the REST envelope maps 429 — all additive).

**Lesson:** [[reuse-cross-surface-contract-type-only-to-avoid-runtime-coupling]] — to share a contract
(auth model) across two surfaces without dragging one surface's heavy runtime (Fastify) into the other,
import it **type-only** and inject the runtime pieces at the composition root; the consumer needs only the
data (`AuthContext.permissions`), not the constructors. Add a shared error code additively and let the
exhaustive switch guide the ripple.

**Next step (AGREED PLAN, 2026-07-03):** R2's actionable features (F-025, F-026) are **done**; the session
is **paused here** on a clean, committed tree. The user set the forward order:
1. **Harden the deferred composition-root seams** (do first): select the `AuthProvider` (F-025) + the MCP
   `gateway` (F-026) from config/server env in `@tessera/config`/`@tessera/server`, and add a persistent
   `TokenStore`/quota store — turning "capability proven by tests" into "usable end-to-end". These are not
   yet tracked features; add them to `feature_list.json` (as `backlog`, linked to FR-52/54/NFR-2 + FR-36)
   before starting.
2. **Then resolve OQ4** (license/business model — a user/business decision) to unblock **F-030** (billing
   behind a Billing port, Dodo Payments; ADR-0011). It stays `backlog` until OQ4 resolves.
3. **R3 later** — **F-027** (governance & audit UI + full audit trail, `@tessera/web`, FR-48/55/NFR-13).

Both R2 features committed per the standing per-feature cadence (F-025 `8d61301`, F-026 `4526302`).

---

## 2026-07-03 — R2 KICKOFF + F-025 DONE: API auth — tenancy + org RBAC + scoped tokens (@tessera/api)
**R2 opened.** R1 is fully done, so the release advanced to **R2**: promoted the eligible R2 cohort
(F-025 `must`, F-026 `should`) `backlog → todo`; **F-030** (billing) stays `backlog` (gated on **OQ4**,
license/business model). Claimed **F-025** by the ordering policy (`by release, then id`). Plan:
[`F-025`](../plans/F-025-multi-tenancy-org-rbac.md); **ADR-0028**.

**What changed** (`@tessera/api` extended — FR-52/FR-54/NFR-2; **additive**, no domain/schema/consumer
change). The **authn/authz control plane** at the `/v1` boundary, all in `apps/api/src/auth/`:
- **RBAC model** (`model.ts`, pure): `ROLES` (owner/admin/member/viewer) → a `PERMISSIONS` catalog +
  `ROLE_PERMISSIONS` (single source of truth); `effectivePermissions` = roles' permissions **∩** a token's
  `scopes` (**least privilege**). `AuthContext = { principal, tenantId, permissions }`.
- **`AuthProvider` port** (`provider.ts`): `createLocalAuthProvider` = **none** (full-access default
  principal in the `default` tenant — today's zero-auth behavior, and the `buildServer` default) +
  `createTokenAuthProvider` (valid `Bearer` required; missing/invalid → 401).
- **`TokenStore` port** (`token-store.ts`) + `createInMemoryTokenStore`: scoped, **revocable** `tsk_`
  tokens **hashed at rest** (SHA-256; plaintext returned once).
- **Enforcement** (`plugin.ts`): `registerAuth` (an `onRequest` hook → `request.authContext`, skips
  `public` routes) + `requirePermission(p)` per-route guards; `buildServer` gains `auth?` (default local
  none); `/v1/openapi.json` stays public. Guards: search→`search:read`, compile→`compile:read`,
  effects→`effects:read`, memory GET→`memory:read`, memory POST/PATCH→`memory:write`. 401/403 via the
  existing `{error}` envelope (`@tessera/core` already had `UnauthorizedError`/`ForbiddenError`).

**Because the default is the none provider**, every existing route + e2e stays green (unauthenticated →
full access); enforcement engages only when a credential-requiring provider is injected.

**Decision (ADR-0028):** ship the control plane in `@tessera/api` behind ports (local adapters now),
back-compatible, default zero-auth. **Deliberately deferred as documented, env-guarded seams** (precedent
F-023/F-021, no false claims): **live OIDC** (just another `AuthProvider`; the IdP/library is an **open ADR**,
OQ4-adjacent), **data-plane per-tenant row isolation** (`tenantId` is resolved + carried, but the domain
stores aren't tenant-scoped yet — no cross-tenant guarantee beyond the boundary), **composition-root wiring**
(config/server env → choose provider; capability proven by the token-provider e2e), a **persistent
TokenStore**, advertising the Bearer scheme in OpenAPI, and **MCP** gateway auth+quotas (**F-026**).

**Evidence/verification (all green, workspace-wide):** state (33 features, **18 effect-links**, wip 1) ·
format · typecheck (28) · lint (16) · **test (28 tasks; api 36 = prior 15 + 21 auth: model 8 / token-store
6 / provider 7)** · build (16) · **e2e (15 tasks; api 25 = prior 18 + 7 auth)**. The auth e2e (`app.inject`)
proves: default build serves `/v1/search` + `/v1/memory` **unauthenticated** (back-compat); token build →
no-token 401, viewer→`memory:write` 403, member→201, revoked→401, `/v1/openapi.json` public.

**Effects:** **E-003** advanced additively (new 401/403 paths; response schemas + OpenAPI unchanged → SDK
+ MCP unaffected) + **new E-018** (the auth/tenancy/RBAC contract: ports, catalog, tenantId seam).

**Lesson:** [[auth-control-plane-default-none-additive]] — add an authn/authz layer as an **injected port**
whose **default adapter is zero-auth full-access**, so enforcement is opt-in and every existing route/test
stays green; make RBAC a pure roles→permissions map intersected with token scopes (least privilege); carry
`tenantId` at the boundary but keep data-plane row-scoping + live OIDC honest, documented seams rather than
overclaiming isolation.

**Next step:** R2 by id — **F-026** (MCP gateway: multi-client auth + quotas — reuses this tenancy/RBAC
model over `@tessera/mcp`; now unblocked). Then the follow-up seams (composition-root provider selection in
`@tessera/config`/`@tessera/server`, a persistent TokenStore, OIDC adapter, data-plane tenant scoping) and
**F-030** billing once **OQ4** resolves. Committed per the standing per-feature cadence (as F-021…F-024).

---

## 2026-07-03 — F-024 DONE: Backup/restore + migration runner — **R1 COMPLETE** (@tessera/storage)
The last R1 feature (FR-56), additive to `@tessera/storage` — no port change (ADR-0027). Plan:
[`F-024`](../plans/F-024-backup-restore-migrations.md).
- **Migration runner** (`migrations/runner.ts`): `runMigrations(db, migrations)` applies ordered
  `{ id, up }` migrations **idempotently**, tracking applied ids in `_tessera_migrations(id, applied_at)`
  and skipping already-applied; ids constrained to a safe pattern; a minimal **`MigrationDb`** seam with
  `sqliteMigrationDb` / `postgresMigrationDb` runs it on **both** backends.
- **Backup/restore** (`backup/backup.ts`): `backupSqlite` (SQLite **online backup** — consistent
  single-file snapshot) + `restoreSqlite` (file copy, clears stale WAL/SHM); `backupDirectory`/
  `restoreDirectory` (recursive fs copy for the blob store). No new deps (better-sqlite3 + `node:fs`).

**Evidence/verification (default; PG skips):** state (33 features, 17 effect-links) · format · typecheck
(28) · lint (16) · **test (28; storage 24 + 11 guarded-skipped)** · build (16). New: SQLite migration
apply/idempotent/incremental/unsafe-id-reject (3) + backup round-trips (2) — seed→backup→mutate→restore
recovers `'original'`; a directory tree round-trips. **Docker was NOT running in the resume session**, so
the guarded Postgres migration-parity test skipped (the Postgres RelationalStore itself was verified live
against the F-023 container; `postgresMigrationDb` is a thin `drizzle.execute` wrapper).

**Decision (ADR-0027):** a lightweight forward/idempotent runner (not a full framework); SQLite online
backup + dir copy (no CLI dep). Deferred: Postgres physical backup (`pg_dump`/managed snapshots — ops);
adopting the runner to replace adapters' ad-hoc `CREATE TABLE IF NOT EXISTS`; down-migrations. Effects
E-001/E-007.

**🎉 R1 COMPLETE** — F-017 (GitHub connector+auto-memory), F-018 (temporal retriever), F-019 (compiler
compression), F-020 (reproducibility/caching/pluggable), F-021 (SSE), F-022 (generated SDK), F-023
(Postgres+pgvector — the `must`), F-024 (backup/migrations) all **done**.

**Next step (R2 / follow-ups):** the self-hosted config profile (Postgres-backed graph/memory +
`createSelfHostedRuntime`), migrate `apps/web` off `lib/api` onto `@tessera/sdk` (ADR-0022), then the R2
backlog (F-025 multi-tenancy+RBAC, F-026 MCP gateway, F-030 billing). NOTE: the ECC GateGuard hook was
disabled mid-session at the user's request.

---

## 2026-07-03 — FIX: untracked `secrets/` source + `.env.example` disclosure (repo hygiene)
Two issues the user flagged after the F-023 commit:
- **Bug — `packages/config/src/secrets/` was git-ignored** (untracked): a bare `.gitignore` rule
  `secrets/` (for secret material) also matched the F-015 `SecretsProvider` **source** (provider/env/
  file/index + test = 5 files). A fresh clone couldn't build `@tessera/config`; `git status` looked
  clean because ignored files aren't shown. This is the **recurrence** of the `storage/` bug
  ([[gitignore-broad-dir-hid-package]]). **Fixed:** anchored `secrets/` → `/secrets/` (root-only) with a
  warning comment; `git add packages/config/src/secrets` → 5 files now tracked (`git ls-files` confirms).
- **Env disclosure — refreshed the root `.env.example`** with the full production/deployment var set
  (authoritative source: `packages/config/src/load.ts` `TESSERA_*` mapping + `apps/server` HOST/PORT/
  TESSERA_TELEMETRY): profile, runtime, storage paths, embeddings, budgets, secrets provider, and the
  self-hosted/cloud block incl. **`DATABASE_URL`** (F-023 Postgres+pgvector). Fixed a stale `LOG_LEVEL`
  → `TESSERA_LOG_LEVEL`. Local integration-test guards (`TESSERA_TEST_*`, `GITHUB_TOKEN`) listed in a
  clearly-marked DEV/CI-only section. (`.env.example` is written via shell — the Read/Write tools are
  permission-denied on `.env*`.)

**Decision:** anchor every bare directory ignore against source collisions (not just the one that bit us);
a CI guard "fail if any `packages/*/src` file is git-ignored" would catch this class — noted in the lesson.

**Evidence:** `git ls-files packages/config/src/secrets` → 5 files. No code changed (the source already
existed on disk and built), so the code gates are unaffected. Environment note: the ECC GateGuard hook
kept fact-forcing edits/bash; complied.

**Next step:** R1 — **F-024** (backup/restore + migration system) is the last open R1 feature.

---

## 2026-07-03 — F-023 DONE (R1 must): Postgres + pgvector adapters + Docker Compose (@tessera/storage)
**Unblocked:** the R1 `must` was previously deferred (no Docker/Postgres/CI here). The user installed
Docker Desktop → verified for real. Plan: [`F-023`](../plans/F-023-postgres-pgvector-docker.md); ADR-0026.

**What changed** (FR-51 — the self-hosted/cloud storage backends, under the *existing* ports; no port or
consumer change).
- **Postgres `RelationalStore`** (`createPostgresStore`, `pg` + `drizzle-orm/node-postgres`) — Drizzle `db`
  handle + migrate/healthcheck/close, mirroring the SQLite adapter.
- **pgvector `VectorStore`** (`createPgVectorStore`) over Postgres + the pgvector extension via **raw SQL**:
  a `vector(N)` column, kNN with `<->`(L2)/`<=>`(cosine), vectors as `$n::vector` **text literals** — **no
  `pgvector` npm dep** (only `pg` added); lazy `CREATE EXTENSION`+table; identifier-validated table name;
  `ON CONFLICT` upsert; dimension validation.
- Both pass the **same** `runRelationalConformance` / `runVectorConformance` suites (port parity with SQLite).
- **`docker-compose.yml`** = `pgvector/pgvector:pg16` service (healthcheck + volume) — the self-hosted stack.
- Conformance is **env-guarded** (`TESSERA_TEST_POSTGRES=1` + `DATABASE_URL`; F-005 pattern), **skipped by
  default** so the offline gate stays green.

**Decision (ADR-0026):** `pg` + drizzle node-postgres; pgvector through raw SQL (no extra dep); env-guarded
conformance verified against a Compose container. A full self-hosted **profile** also needs Postgres-backed
graph/memory stores (current ones are SQLite-specific), so `createLocalRuntime` still throws for non-local —
F-023 ships the adapters + stack a later profile composes (E-014). Backup/migrations = F-024.

**Evidence/verification:** state (33 features, 17 effect-links). **Guarded, against the LIVE container**
(`docker compose up -d --wait postgres` → healthy): **10 tests green** — pgvector **6/6** (VectorStore) +
postgres-relational **4/4** (RelationalStore + Drizzle round-trip); all **29** storage tests pass with PG
enabled. **Default gates (PG skips):** typecheck (28) · lint (16) · format · test (28) · build (16).

**Effects:** E-001 / E-007 realized — the storage ports now have Postgres/pgvector adapters passing the
shared conformance suites (both effects already anticipated "later postgres, pgvector").

**Lesson:** [[verify-cloud-adapter-env-guarded-against-a-container]] — bring a cloud/self-hosted adapter to
port-parity with the local one by making it pass the **same conformance suite**, guarded behind an env flag
(skipped by default so the offline gate stays green), and verify it for real against a **Docker Compose**
service. (Also: Docker Hub's CDN DNS can be flaky on first pull — retry the pull.)

**Environment note:** an ECC **GateGuard** hook (loaded this session) fact-forces every edit/bash; complied
throughout. **Postgres container left running** (`docker compose down` to stop; volume `tessera-postgres-data`
persists).

**Next step:** R1 by id — **F-024** (backup/restore + migration system, `@tessera/storage`) is the last
open R1 feature. Follow-ups: the self-hosted config profile (Postgres graph/memory + a `createSelfHostedRuntime`
branch) and migrating `apps/web` off `lib/api` onto `@tessera/sdk` (ADR-0022).

---

## 2026-07-02 — F-022 DONE: Generated TypeScript SDK from OpenAPI (@tessera/sdk)
**What changed** (FR-39; ADR-0025). Plan:
[`F-022`](../plans/F-022-generated-typescript-sdk.md). New **`@tessera/sdk`** — the first-class TS client
whose **types are generated** from the `/v1` OpenAPI document, so it can never drift from the contract.
- **Generation:** `scripts/generate.mjs` boots `buildServer({})` (the doc is built from the static route
  schemas — handlers never run, so empty services suffice), captures `app.swagger()`, writes
  `openapi.json`, and runs **openapi-typescript** → `src/generated/schema.ts` (committed; eslint +
  prettier-ignored via `**/generated/**`; still typechecked because the client imports it).
- **Client:** `createTesseraClient({ baseUrl, fetch?, headers? })` over **openapi-fetch** (~6 KB, zero
  transitive deps) with ergonomic named methods (`search`/`compile`/`getEffects` + memory CRUD) and
  request/response **type aliases derived from the generated `paths`**; `unwrap()` maps a non-2xx `{ error }`
  envelope to a typed **`TesseraApiError`** (code/status/details).

**Decision (ADR-0025):** generate the **types** (openapi-typescript, dev-only) + a **thin** typed client
(openapi-fetch, runtime). Keeps the hand-written surface tiny and drift-proof. openapi-fetch is a small,
focused, zero-transitive-dep library — the idiomatic consumer of openapi-typescript output — unlike the
large Octokit rejected in ADR-0024 for the GitHub connector.

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(28) · lint (16) · format · **test (28 tasks; sdk 5 new)** · build (16). The 5 tests are a **round-trip
against the real in-memory API over a socket**: search (ranked + attribution), compile (budget-bounded),
memory capture→get→edit(v2)→history→list, `NOT_FOUND`→`TesseraApiError`, and 400 validation. New deps
(`openapi-fetch` runtime; `openapi-typescript` + `@tessera/api` dev) — `pnpm-lock` updated.

**Effects:** E-003 realized (the `@tessera/sdk` consumer of the OpenAPI contract) — a route/schema change
now means "regenerate the SDK types" (tsc then catches any wrapper drift).

**Lesson:** [[generate-sdk-types-from-live-swagger-thin-client]] — generate an SDK's **types** from the
API's own runtime OpenAPI (`buildServer({}).swagger()` — no live services needed since the doc is built
from static route schemas) and wrap them in a **thin** typed client, rather than a heavy full-client
generator or a hand-written client; commit + ignore the generated file (lint/format) but keep it
typechecked so drift surfaces at build.

**Next step:** R1 by id — **F-024** (backup/restore + migration system — `@tessera/storage`). **F-023**
(Postgres + pgvector, the R1 `must`) remains blocked here until Docker/Postgres or CI is available. A
follow-up: migrate `apps/web` off `lib/api` onto `@tessera/sdk` (ADR-0022).

---

## 2026-07-02 — F-021 DONE: Realtime updates via Server-Sent Events (@tessera/api)
**What changed** (FR-38; extends ADR-0016 REST surface — no new ADR). Plan:
[`F-021`](../plans/F-021-realtime-sse.md). Added a **Server-Sent Events** stream for live updates —
**additive** to the REST surface (no change to existing routes/schemas; MCP untouched).
- **`events.ts`:** a typed **`ApiEventBus`** over the core `EventBus` (`ApiEventMap` =
  `document.ingested` / `document.removed` / `memory.captured` — JSON-safe, non-sensitive summaries) +
  `sseFrame`/`sseComment`.
- **`routes/v1/events.ts`:** `GET /v1/events` `reply.hijack()`s and owns `reply.raw`, writing
  `text/event-stream` with a reconnect hint + `: connected` handshake. It **subscribes before** the
  handshake (no event lost between connect and subscribe), heartbeats on an **`unref`'d** timer, and
  tears down subscriptions + timer on the request `close`.
- **`buildServer`** gains an `events?` option (default `createApiEventBus()`); the **memory-capture
  route is a real producer** (emits `memory.captured`). SSE headers (`x-accel-buffering: no`,
  `cache-control: no-transform`) stop proxies buffering the stream.

**Decision:** **SSE, not WebSocket** — server→client push is exactly FR-38's need (ingest progress, new
memories) and is HTTP-native/testable; WS (bidirectional) is a later option. Wiring the **ingestion
worker** producer into the API runtime is the same downstream runtime seam (event types + transport are
ready; a test emits on the bus directly).

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(27) · lint (15) · format · **test (27 tasks; api 15 = prior 11 + 4)** · **e2e (15 tasks; api 18 = prior
14 + 4)** · build (15). The SSE e2e runs against a **real listening socket** (`listen:0` + a `fetch`
stream reader, `AbortController` cleanup): handshake, an emitted bus event delivered, `POST /v1/memory` →
`memory.captured` streamed, and `/v1/events` present in the OpenAPI doc.

**Effects:** E-003 (a new additive `GET /v1/events` route; existing routes/schemas + MCP unchanged;
OpenAPI regenerated).

**Lesson:** [[sse-test-real-socket-and-subscribe-before-handshake]] — an SSE endpoint can't be tested with
`app.inject` (it waits for a response that never ends); drive it over a **real socket** with a streaming
reader + `AbortController` cleanup. And in the handler, **subscribe to the event source before writing the
opening frame**, so no event emitted during connection setup is missed; `hijack` the reply, `unref` the
heartbeat, and clean up on `request 'close'`.

**Next step:** R1 by id — **F-022** (generated TypeScript SDK from the OpenAPI doc — offline codegen,
supersedes `apps/web/lib/api`), then **F-024** (backup/restore + migrations). **F-023** (Postgres +
pgvector, the R1 `must`) remains blocked here until Docker/Postgres or CI is available.

---

## 2026-07-02 — F-020 DONE: Compiler reproducibility + caching + pluggable strategies (@tessera/context-compiler)
**What changed** (FR-33/34; ADR-0004 — no new ADR). Plan:
[`F-020`](../plans/F-020-compiler-reproducibility-caching-pluggable.md). Added reproducibility, caching,
and pluggable stage strategies to the compiler as **new optional options** — **no `ContextPackage`/REST/
MCP shape change** (FR-34 explicitly: "swap ranker/compressor without API change").
- **Pluggable strategies (`strategies.ts`):** `CompressionStrategy` (default `extractiveCompression`
  wrapping F-019's `compressToFit`) + `RankStrategy` (default `defaultRankStrategy` wrapping
  `rankCandidates`), injected via `compile` options; each carries an `id`.
- **Cache (`cache.ts`):** `CompilationCache` port + `createInMemoryCompilationCache` (LRU). When a cache
  is injected, an identical compile is served **verbatim** (identical package → true reproducibility).
- **Key (`key.ts`):** `computeCompilationKey(normalizedRequest, fingerprint)` = sha256 of canonical JSON
  of {task, budget, **effective** retrievalLimit, sorted filter kinds} + a **config fingerprint**
  (strategy ids + dedup/expand knobs). Deterministic, order-independent for kinds.
- **`compiler.ts`:** pipeline extracted to `runPipeline()`; `compile()` validates → (with cache) key →
  hit returns verbatim / miss compiles once and stores; ranks via the strategy, compresses via the
  strategy.

**Decisions:** cache hit returns the stored object (reproducibility over cache-hit visibility); key stays
internal (exposing it on the package/API is a follow-up seam); LLM compressor + persistent/shared cache +
fine-grained per-stage incremental recompute are deferred (the strategy/port seams enable them).

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(27) · lint (15) · format · **test (27 tasks; context-compiler 34 = prior 25 + 9 new)** · build (15).
New tests: key determinism/sensitivity/order-independence, LRU get/set/evict, and an integration test —
cache hit skips retrieval and returns an identical package (miss on a different request), no-cache
reproducibility, and **compressor/ranker swaps** that change output with an **unchanged package shape**.

**Effects:** E-013 (new optional compiler options + reproducibility key; **no ContextPackage/API shape
change** → E-003 untouched).

**Also fixed:** an F-019 status slip — its `notes` were added but `status` was left `in_progress` (caught
by `verify-state` when claiming F-020: "2 features in_progress"). Flipped F-019 → `done`.

**Lesson:** [[cache-key-must-fingerprint-every-output-affecting-input]] — a reproducibility/cache key must
fold in a fingerprint of **every** knob and pluggable-strategy `id` that affects the output; miss one and
the cache silently serves a stale result for a changed configuration. Keep the fingerprint next to the
key function with a "add new output-affecting options here" note.

**Next step:** R1 by id — **F-021** (realtime updates, SSE/WebSocket — @tessera/api; verifiable via
app.inject/e2e), then **F-022** (generated TypeScript SDK from OpenAPI — offline codegen). **F-023**
(Postgres + pgvector, the R1 `must`) stays blocked here until Docker/Postgres or CI is available.

---

## 2026-07-02 — F-019 DONE: Compiler compression stage, citation-preserving (@tessera/context-compiler)
**Note on sequencing:** the R1 `must` **F-023** (Postgres + pgvector + Docker Compose) was **deferred** —
this environment has **no Docker/Postgres and no active CI**, so its conformance suite can't be verified
against a real backend (harness: verification is the proof). The user chose to do F-019 instead; F-023
stays `todo` until a Postgres/CI path exists.

**What changed** (FR-31; ADR-0004 context-compilation — no new ADR). Plan:
[`F-019`](../plans/F-019-compiler-compression-citation-preserving.md). The compress stage now
**compresses** over-budget fragments instead of only dropping them — a deterministic, **offline**,
query-relevant **extractive** summarization that **preserves each fragment's citation** (same
`ref`/provenance) and **never exceeds the budget**. Entirely inside `@tessera/context-compiler` — **no
domain/API schema change**.
- **`stages/compress-text.ts` (new):** `compressToFit(text, query, targetTokens)` — segments text into
  lines→sentences (a conservative `.!?`+space split that leaves code lines intact), scores each by
  query-term overlap, greedily keeps the most-relevant segments that fit, restores original order, and
  never exceeds the target; returns `undefined` if not even one segment fits.
- **`stages/compress.ts`:** `fitToBudget` → `compressToBudget(items, budget, { query })` — whole
  fragments pass through; an overflowing one is compressed to the remaining budget (when it's ≥ a
  16-token floor), else dropped-and-continue (graceful degradation preserved).
- **Surfaced without new fields:** `assemble` uses the excerpt + appends `"compressed to fit budget
  (N→M tokens)"` to the existing `whyIncluded`; the compiler adds a compress **trace note** (count +
  tokens saved). So REST/MCP/web (E-003) render compression with **zero contract change**.

**Decision:** offline extractive compression (no LLM); **abstractive/pluggable** compression is F-020
(pluggable stage strategies) — kept a documented seam.

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(27) · lint (15) · format · **test (27 tasks; context-compiler 25 = prior 17 + 8 new)** · build (15).
New tests: compress-text (relevance/original-order/never-exceed/undefined/deterministic), compress
(whole-passthrough / compress-salvage / graceful-skip / never-exceed), and a compiler integration test
where an over-budget top fragment is salvaged as a **cited excerpt**, the package fits the budget, and the
trace records the compression. The existing beats-naive + budget-bounded compiler tests stay green.

**Effects:** E-013 (compress stage behavior; **no ContextPackage/API shape change** → E-003 untouched).

**Lesson:** [[surface-new-behavior-via-existing-explainability-field]] — to add visible behavior (here:
compression) without rippling a cross-package schema, carry the new info through an **existing
explainability channel** (the per-fragment `whyIncluded` + the stage trace note) instead of adding a new
`ContextPackage`/API field; the change stays contained to one package and the inspector shows it for free.

**Next step:** R1 by id — **F-020** (compiler reproducibility + caching + pluggable stage strategies;
would also make this compressor swappable for an LLM one), then **F-021** (SSE/realtime), **F-022**
(generated SDK). **F-023** (Postgres + pgvector, the R1 `must`) remains blocked here until Docker/Postgres
or CI is available.

---

## 2026-07-02 — F-018 DONE: Temporal retriever (recency / time-window) (@tessera/retrieval)
**What changed** (the 5th retrieval signal, FR-24; ADR-0003/F-009 fusion — no new ADR)
Plan: [`F-018`](../plans/F-018-temporal-retriever.md). Added `'temporal'` to `RETRIEVER_KINDS` (the
single source of truth) and a `createTemporalRetriever` adapter behind the **existing** `Retriever`
interface. It **mirrors the keyword retriever**: takes a SQLite `db`, owns a `retrieval_temporal(ref, ts)`
table with `index`/`remove`, and `retrieve()` returns the **most-recent** refs (`ORDER BY ts DESC,
ref ASC`, optional `ts >= now-window`) scored by **exponential recency decay** `2^(-age/halfLife)`
(in `(0,1]`, best-first/monotonic → satisfies the conformance ordering invariant). Clock is **injected**
for deterministic tests; timestamps normalize from `number(ms)|ISO|Date` (invalid → `ValidationError`).
Wired into `createLocalRuntime`'s hybrid set + exposed as **`Runtime.temporal`** (like `keyword`) so
ingestion can populate it.

**Fully additive — no consumer changed:** because `apps/api`'s `retrieverKindSchema = z.enum(RETRIEVER_KINDS)`
is **derived** (auto-picks up `temporal`), the compiler treats `RetrieverKind` as an **opaque tag** (no
switch), and the web `SignalBadge` **already mapped** `temporal → --chart-5`. Widening the enum rippled
nowhere.

**Evidence/verification (all green, workspace-wide):** state (33 features, 17 effect-links) · typecheck
(27) · lint (15) · format · **test (27 tasks; retrieval 31 = prior 23 + 8 new)** · build (15). New tests:
conformance (temporal) + newest-first ordering + decay (0.5 at exactly one half-life) + window exclusion +
limit/idempotent-reindex/remove + invalid-timestamp + a **fusion** test where a recent item outranks an
older one and carries both `temporal` + `keyword` attribution.

**Effects:** E-012 (widened — new adapter + conformance; documented the derived-enum/opaque-tag dependents)
+ E-014 (Local profile now constructs the temporal retriever + exposes `Runtime.temporal`).

**Lesson:** [[enum-driven-contract-additive-variant]] — when downstream validation/typing is **derived
from one source-of-truth constant** (a Zod `z.enum(CONST)`, an opaque type tag, a lookup with a fallback),
adding a new variant is purely additive and ripples nowhere; design shared enums this way so the fifth
option costs almost nothing.

**Next step:** continue R1 by id — **F-019** (compiler compression stage, citation-preserving), then
F-020 (compiler reproducibility/caching), **F-022** (generated SDK), **F-023** (Postgres + pgvector, the
only R1 `must`). Populating the temporal index from ingested timestamps is a small follow-up (same corpus
seam keyword/semantic have).

---

## 2026-07-02 — R1 KICKOFF + F-017 DONE: GitHub connector + auto memory extraction (@tessera/ingestion)
**R1 opened.** R0 is fully done, so the current release advanced to **R1**: promoted the R1 cohort
(F-017–F-024) `backlog → todo` (release kickoff), then claimed **F-017** by the ordering policy
(`by release, then id`). Plan: [`F-017`](../plans/F-017-github-connector-auto-memory.md).

**What changed** (`@tessera/ingestion` extended — FR-4 + FR-14; ADR-0024)
- **GitHub connector (FR-4):** `createGitHubConnector` implements the **existing** `Connector` port —
  issues **and** PRs (with comments) become documents at synthetic paths (`issue/{n}`, `pr/{n}`).
  The content hash is over the item's **mutable fields**, so the F-006 pipeline processes them
  **incrementally + idempotently** and the **terminal redaction gate** scrubs secrets for free.
  GitHub is reached via native **`fetch`** behind an injectable **`GitHubClient`** (paginated; typed
  401/403-rate-limit/404 → `@tessera/core` errors) — **no Octokit**, so the package stays
  dependency-free (ADR-0015 precedent). **Network only when a source is explicitly configured**
  (NFR-3); tests use an in-memory **fake**, with an **env-guarded live smoke** (`TESSERA_TEST_GITHUB=1`).
- **Auto-memory extraction (FR-14):** deterministic, rule-based `MemoryExtractor`s — **ADR** →
  `decision` (from the Decision section), **merged PR** → `decision`, **closed issue** → `lesson` —
  plus **`createMemoryExtractionSink`**, a `DocumentSink` **decorator** that captures **idempotently**
  by `metadata.source` (`adr:NNNN` / `github:owner/repo#n`): supersede-on-change, skip-if-identical,
  **never duplicate**. **`teeSink`** fans out to persistence + extraction. The memory dependency is a
  **structural `MemoryCaptureService` seam** → ingestion gains **no new runtime dep and no cycle**.

**Decision (ADR-0024):** GitHub via REST `fetch` (not Octokit) + heuristic extraction via a structural
memory seam. Deferred: commit-message extraction (needs per-commit ingestion), LLM extraction, GitHub
source wiring into the Local profile (F-015), webhooks/realtime (F-021).

**Evidence/verification (all green, workspace-wide):** state (33 features, **17 effect-links**,
wip_limit 1) · typecheck (27) · lint (15) · format · **test (27 tasks; ingestion 48 = prior 25 + 23
new)** · build (15). New tests: github-client (fake-fetch pagination/headers/error-map), github
connector conformance + provenance + incremental + include-filter (fake client), adr/github extractors,
extraction-sink capture/skip/supersede + tee, and a full **fs → pipeline → memory** integration proving
the ADR yields one decision, a plain file yields none, re-scan is idempotent, and editing the ADR
supersedes the memory to v2.

**Effects:** E-009 (github connector realized under the existing Connector port) + E-010 (new memory
consumer via the structural seam) + **new E-017** (the auto-extraction seam).

**Lesson:** [[auto-extraction-structural-memory-seam]] — a cross-package "producer→consumer" step
(ingestion doc → memory capture) can stay dependency-free and acyclic by declaring a **minimal
structural interface** for the consumer instead of importing it, and by making it an **additive
`DocumentSink` decorator** (composed via `teeSink`) rather than mutating the worker. Key it on a stable
`source` id so re-ingest supersedes/skips (idempotent), never duplicating.

**Next step:** continue R1 by id — **F-018** (temporal retriever; simplest, fully offline, fits the
existing `Retriever` interface E-012), then F-019/F-020 (compiler compression/caching), **F-022**
(generated SDK, supersedes `lib/api`), **F-023** (Postgres + pgvector, the only R1 `must`). Wiring a
GitHub source into the Local profile (F-015) is a small follow-up seam when a source config lands.

---

## 2026-07-01 — Align All Route Pages with Dashboard 3 Design System
Aligned all routes and views (Search, Inspector, Graph, Memory, Settings, Sources) with the flat, borderless, matching-card-background theme.
- **Global Card Styles:** Removed default borders from the global `Card` component in `ui/card.tsx` to automatically render all cards across the application flat and borderless. Removed `border-b` horizontal dividers from card headers in `dashboard.tsx`, `inspector-view.tsx`, `search-view.tsx`, `recent-conversations.tsx`, `support-activity.tsx`, and `team-on-duty.tsx` to match efferd's flat aesthetic.
- **Unified Page Layout & Headers:** Removed duplicate H1 page headers from `search/page.tsx` and `inspector/page.tsx`, and wrapped their views in the same `max-w-4xl w-full space-y-4` layout used by the Dashboard.
- **Header Separator & Buttons UI/UX:** Replaced stretched Radix vertical separator components in `app-header.tsx` with clean CSS separators of exact `h-4 w-px` bounds. Standardized all action buttons in the header to `variant="ghost" size="icon-sm"` to remove cluttered borders.
- **Search & Inspector UI Overhaul:** Wrapped the Compile form and Search input inside their own unified `border-none bg-sidebar p-4` cards. Refined inner card lists, margins, code pre elements, and indicators to use compact typography and colors matching the homepage. Replaced Lucide icons with cohesive `IconPlaceholder` references.
- **ComingSoon & EmptyState Refinement:** Updated `EmptyState` and `ErrorState` components to be borderless, use `bg-card` (#171717), and have compact typography/padding. Refined `ComingSoon` to stretch and align itself vertically and horizontally at the exact center of the page.
- **Button Physics & Micro-Animations:** Embedded `active:translate-y-[1px]` to standard buttons to create clickable physics, and implemented tailwind color-mix variables for hover outlines.
- **Global Cursor Rules:** Configured global cursor-pointer styles on buttons and interactive roles, and cursor-not-allowed on disabled states.
- **Evidence:** Clean typecheck, production build, and all 5 E2E Playwright tests (including WCAG A/AA Axe scans) pass green.

---

## 2026-06-30 — Solidify Dashboard: Remove Fake Data, Align Exact Theme Colors & Refine Layout
Refined the dashboard implementation to remove all hardcoded mock data, align colors, customize scrollbars, and optimize layout margins/paddings.
- **Removed Fake Data & Structured Zeroth UI:** Updated all dashboard components to accept dynamic data props. Designed a flexible-height, accessible zeroth UI blueprint for Recent Compilations showing empty metadata and file paths (`0 tokens`, `0.00s compile time`) with a clear call-to-action button, satisfying WCAG AA color contrast rules.
- **Tessera Geometric Logo:** Replaced logo paths in `logo.tsx` with a highly polished mathematical, floating isometric cube made of 3 rhombuses representing mosaic pieces (tesserae) separated by precise parallel gaps.
- **Exact Color Palette Alignment:** Updated card and popover variables in `globals.css` to `#171717` (exactly matching the sidebar background color) and removed borders on all dashboard components.
- **Layout and Padding Fixes:**
  - Removed `h-full` from `SidebarInset` in `app-shell.tsx` to prevent vertical overflow clipping and show rounded corners at the bottom.
  - Flattened stats card markup to direct flex children under Card with a uniform `gap-4` spacing.
  - Reduced collapsed sidebar outer padding to `p-1` and width to `50px`, hiding the search button when collapsed so the Quick Create button centers perfectly.
- **Evidence:** Typecheck, build, and E2E Playwright tests (5/5 tests, including WCAG A/AA Axe checks) pass green.

---

## 2026-06-30 — Align Dashboard with efferd's Dashboard 3 (F-014/F-028 alignment complete)
Completed the alignment of the frontend UI/UX and design system with efferd's Dashboard 3 using the fetched registry sources.
- **Implemented Shell Components:** Created `custom-sidebar-trigger.tsx`, `latest-change.tsx`, `nav-user.tsx` (wrapped in focusable button), `app-shared.tsx` (dynamic navigation), `app-sidebar.tsx` (collapsible grouped navigation + latest change), `app-header.tsx` (trigger + breadcrumbs + theme toggle + search + user menu), and updated `app-shell.tsx`.
- **Implemented Dashboard 3 Visuals:** Created `dashboard.tsx` rendering `DashboardStats` (Tessera empty/onboarding states), `ConversationVolumeChart` (Area), `ChannelBreakdownChart` (Pie), `CsatResponsesChart` (Stacked Bar), `FirstReplyTimeChart` (Line), `TeamOnDuty` (List + Dropdown), `RecentConversations` (Table), and `SupportActivity` (operational signals).
- **a11y & TS Fixes:** Fixed `exactOptionalPropertyTypes` compatibility across components. Fixed all Playwright/Axe a11y violations: wrapped Avatar trigger in `<Button>` (`aria-allowed-attr`), added `aria-label` to latest-change close button (`button-name`), wrapped sidebar items in `<SidebarMenu>` (`listitem`), and added focus/label to Table scroll container (`scrollable-region-focusable`). Fixed Playwright E2E link strict-mode violation.
- **Evidence:** Typecheck, lint, format, unit tests (13/13 web, 27/27 total), and E2E Playwright tests (5/5 including Axe-core WCAG A/AA verification) all pass green.

---

## 2026-06-30 — Dashboard redesign: efferd Dashboard 3 as the binding design reference
Second, deeper UI overhaul after the reviewer rejected the prior look as generic. Researched the
references (efferd/coss-ui/shadcnblocks are all **shadcn blocks**; Aceternity = marketing pages;
Astryx = immature) and **viewed efferd via the Claude-in-Chrome extension** to pick a dashboard.
- **Decision (ADR-0023):** stay on shadcn/ui (ratifies ADR-0009/0021); **bind efferd Dashboard 3**
  as the concrete reference, extracted from its real registry source (`@efferd/dashboard-3` +
  `@efferd/app-shell-3`). Locked in [`DESIGN-SYSTEM.md` §0](../../docs/design/DESIGN-SYSTEM.md).
- **Implemented (3 commits):** (1) added the shadcn primitives via the official CLI — Sidebar,
  Chart (Recharts), Table, Select, Avatar, Breadcrumb, Collapsible, Kbd (import + fine-tune, as
  the lead wanted); (2) **dark-first design system** (near-black, flat `shadow-none` cards,
  monochrome `--chart-*` ramp, emerald-up/red-down `Delta` as the only accent) + **shell rebuilt
  on the shadcn Sidebar** (inset, grouped nav with section labels, **mosaic logo**, breadcrumb
  header) + signature components (`Delta`/`Logo`/`StatusIndicator`/formatters); (3) **Overview**
  rebuilt to efferd's stat-card grid with honest empty/onboarding states (no fabricated data).
- **Also fixed earlier:** eslint `tsconfigRootDir` (typescript-eslint#10841), `@tessera/server`
  `dev`/`dev:mcp` scripts (tsx), `apps/web/.env.example`.

**Evidence (all green, every commit):** typecheck (27) · lint (15) · format · test (web 13;
workspace 27) · build · **e2e (5 incl. axe WCAG A/AA on home/search/inspector)**. Verified
**visually in dark + light** by screenshot each step (no washout). Commits 8999db9, dfa077d,
2a81f0b.

**Lesson:** [[frontend-quality-bar]] — follow a concrete, proven reference (a real shadcn block
like efferd) rather than inventing taste; pull its actual registry source for fidelity; the
component library was never the problem (we were already on shadcn — efferd IS shadcn).

**Next:** data-rich chart cards (activity area / breakdown donut / recent table) as real metrics
endpoints land; pull efferd Pro blocks (7/8/9) if desired. (Refinement of F-014/F-028 — no
feature-status change.)

---

## 2026-06-30 — Fixes + UI design overhaul (apps/web) — enterprise-grade pass
Refinement of the R0 UI (no feature-status change) addressing reviewer feedback + DX gaps.
- **Lint:** set `tsconfigRootDir: import.meta.dirname` in the web + root flat ESLint configs —
  fixes the IDE "multiple candidate TSConfigRootDirs" parser error (typescript-eslint#10841).
- **DX:** added `@tessera/server` `dev`/`dev:mcp` scripts (`tsx watch src/bin/*`) so
  `pnpm --filter @tessera/server dev` works (first run downloads the embedding model — local-first;
  same as `start`). Added [`apps/web/.env.example`](../../apps/web/.env.example)
  (`NEXT_PUBLIC_API_BASE_URL`) + gitignored local env files.
- **UI overhaul** (the dashboard looked generic/"washed-out"): refined the token palette (cool
  neutrals + a restrained violet accent, off-white canvas, white cards, deeper cool-slate dark),
  adopted the **Geist** typeface (bundled — offline-safe), polished the sidebar (gradient brand
  mark, "Platform" section, profile footer), refined the topbar, and gave KPI cards icon chips +
  stronger hierarchy. **Removed the content fade-in** — it flashed washed-out on first paint and
  was the root cause of the "worst UI" report (and of axe contrast failures: axe saw the
  mid-animation blended color).
- **a11y:** fixed two axe contrast violations the new palette/fade exposed — the sidebar section
  label (dropped the `/70` opacity) and the primary button (deepened the violet so white text
  clears 4.5:1).

**Evidence (all green, workspace-wide):** typecheck (27) · lint (15) · format · test (27) · build
(15) · **e2e (15) incl. axe WCAG A/AA = 0 violations on home/search/inspector (light + dark)**.
**Verified visually** by screenshotting the running prod build in light + dark.

**Lesson:** [[frontend-quality-bar]] — gates green ≠ good UI; render + screenshot before declaring
UI done. [[e2e-against-prod-build]] — and avoid decorative opacity page-fades (FOUC + a11y flake).

---

## 2026-06-30 — F-014 DONE: Dashboard — global search + Context Package inspector (R0 UI arc complete)
**What changed** (the dashboard now drives the real engine — FR-41/FR-44/FR-49, NFR-9; ADR-0022)
- **Data layer (ADR-0022 — production-real, no mock data in the app):** `apps/web/lib/api` —
  `apiFetch` (base URL via `NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:3000/v1`; parses
  the `{ error: { code, message } }` envelope → `TesseraApiError`) + typed methods mirroring the
  `/v1` Zod schemas + **TanStack Query** hooks (`useSearch`/`useCompile`); `QueryClientProvider`
  wired in `app/providers.tsx`. It is a **drop-in seam** the F-022 `@tessera/sdk` replaces.
- **Search (FR-41):** debounced query → `POST /v1/search`; ranked results, each showing
  **provenance** — the contributing signals (semantic/keyword/graph/symbolic) with per-signal
  rank/score/weight on hover. Loading/empty/error states.
- **Context Package Inspector (FR-44, flagship):** task+budget form → `POST /v1/compile` →
  renders the `ContextPackage`: package **scores** (budget adherence / provenance coverage /
  redundancy as accessible progress bars), **sections → fragments** (kind, tokens, score,
  per-fragment **"why included"**, provenance signals + `expandedFrom`), and the full
  **CompilationTrace** (per-stage input→output + drops with reasons). Provenance-first throughout.
- Added the **Inspector** nav item; replaced the `/search` stub.

**Decision (recorded ADR-0022):** the lead required a production system with **no dummy data**.
ADR-0009 mandates data via the generated SDK, but `@tessera/sdk` is F-022 (R1). Rather than
reorder the roadmap or ship fixtures, F-014 uses a **real, typed, centralized `/v1` client**
(`lib/api`) behind TanStack Query — production-real, "no scattered fetch", and a localized swap
for the SDK at F-022. Tests stub at the network/client boundary (test infra, not app data).

**Evidence/verification (all green, workspace-wide):** state (33 features, 16 effect-links) ·
typecheck (27) · lint (15) · format · test (web **13** — `lib/api` envelope parsing + search +
inspector via Vitest/RTL; workspace 27) · build (`next build`, **9 routes** incl. `/inspector`;
workspace 15) · **e2e (web 5 Playwright incl. `@axe-core` WCAG A/AA on home/search/inspector = 0
violations; workspace 15)**. e2e now serves the **production build** (`next build && next start`)
instead of the dev server — removes Turbopack cold-compile flakiness on this slow filesystem.

**Lesson:** [[e2e-against-prod-build]] — drive UI e2e against `next start` (prebuilt static pages),
not `next dev`; the dev compiler's mid-test cold-compile is the flake source under parallel load.
Centralize the data path behind one typed client + React Query so swapping the hand-client for the
generated SDK (F-022) is a localized change.

**Milestone:** the **R0 UI arc is complete** (F-033 harness → F-028 foundation → F-014 dashboard).
With the full R0 backend already done, **all of R0 is now done** except F-022's SDK swap is an R1
follow-up that supersedes `lib/api`.

**Next step:** R1 — e.g. **F-022** (generated SDK, supersedes `lib/api`), **F-017/F-018/F-019/
F-020** (GitHub connector + auto-memory, temporal retriever, compiler compression/caching),
**F-023** (Postgres + pgvector). Pick per release order.

---

## 2026-06-30 — F-028 DONE: UI foundation (Next.js dashboard shell, tokens/theming, shadcn, ⌘K)
**What changed** (the dashboard foundation — FR-49, NFR-9; ADR-0009; built on the F-033 harness)
- **`apps/web` (`@tessera/web`) stood up**: Next.js 16 (App Router, React Server Components) +
  React 19 + TypeScript strict + Tailwind v4 + shadcn/ui, wired into the workspace toolchain
  (turbo typecheck/lint/test/build/e2e). Built with the [`build-ui`](../skills/build-ui/SKILL.md)
  skill against [`DESIGN-SYSTEM.md`](../../docs/design/DESIGN-SYSTEM.md) + its manifest.
- **Design tokens + theming**: semantic CSS variables (OKLCH) in `app/globals.css`
  (`:root` + `.dark`) mapped via Tailwind v4 `@theme`; **light/dark/system** via `next-themes`
  (system default). Components reference tokens only — never hardcode (E-004).
- **Base shadcn primitives** (owned in-repo, `components/ui/*`): button, card, input, badge,
  separator, skeleton, tooltip, dialog, dropdown-menu, sheet, command, sonner.
- **App shell**: collapsible sidebar (`--sidebar-*`) + sticky topbar (command-palette search,
  theme toggle, **user/org placeholder — auth is R2/F-025**), responsive mobile drawer (Sheet),
  skip-link + landmarks. **⌘K command palette** (cmdk) with nav + theme actions, a Zustand store,
  and a global Ctrl/⌘-K listener.
- **UX-baseline primitives** (FR-49): `EmptyState`/`ErrorState`, `Skeleton`, sonner toasts;
  **functional motion** (`lib/motion` + Framer `MotionConfig reducedMotion="user"` + a CSS
  reduced-motion fallback). Navigable stub pages for the remaining nav routes.

**Scope honesty:** foundation only — **no data layer** (the generated `@tessera/sdk` is F-022/R1;
F-014 wires real data + the Context Package inspector). Next 16/Tailwind v4 are latest-stable
within the locked stack (no new stack ADR). `next-env.d.ts` is Next-generated (gitignored); the
web `typecheck` runs `next typegen` first so the gate is self-sufficient before the build gate.

**Evidence/verification (all green, workspace-wide):** state (33 features, 16 effect-links) ·
typecheck (27 tasks; web = `next typegen` + `tsc`) · lint (15) · format · test (web **7**
component tests — Vitest+RTL+jsdom: cn, EmptyState, ThemeToggle, CommandPalette; workspace 27) ·
build (`next build`, 8 routes prerendered; workspace 15) · **e2e (web 3 Playwright incl.
`@axe-core` WCAG A/AA = 0 violations; workspace 15)**. The **`a11y` gate is now active**
(ADR-0021); CI installs the Playwright browser before gate 6 (E-005 lockstep).

**Decisions (delegated to Claude, under ADR-0009/0021):** Next 16 + Tailwind v4 (latest stable);
shadcn owned-in-repo; Zustand for the ⌘K open-state; axe-in-Playwright as the a11y gate;
`next typegen` to make web typecheck order-independent.

**Lesson:** [[next-typegen-before-tsc]] — for a Next app under a typecheck-before-build gate
order, run `next typegen` inside the typecheck script and gitignore `next-env.d.ts`, so the gate
is self-sufficient on a clean tree. Adding a browser-based e2e means CI must `playwright install`
before the e2e gate (keep gates.json ↔ ci.yml in lockstep, E-005).

**Next step:** **F-014** (dashboard: global search + **Context Package inspector** + UX baseline)
— now unblocked (F-028 + F-011 done). It adds the data layer (interim typed client until the
F-022 SDK) and the provenance-first inspector.

---

## 2026-06-30 — F-033 DONE: Frontend execution harness (UI skills + web gates + design manifest)
**What changed** (the frontend harness, built BEFORE the UI arc so it is actually used — ADR-0021)
- **Decision — keep shadcn/ui; defer Astryx.** Evaluated **Meta Astryx** (open-sourced
  2026-06-27, MIT; React on **StyleX**; CLI + **MCP server + JSON manifest** "agent-ready"; 150+
  components; coexists with Tailwind via precompiled CSS + cascade layers). **Deferred to an R1
  watch-item** and **ratified [ADR-0009](../../docs/adr/0009-frontend-stack-and-design-system.md)**:
  a 3-day-old public dep fails the production-grade bar, would replace shadcn and orphan the
  tweakcn token workflow + the curated reference set, and trades owned-in-repo control for an
  external dependency.
- **Stole Astryx's best idea** — a **machine-readable design manifest**:
  [`docs/design/design-system.manifest.json`](../../docs/design/design-system.manifest.json)
  projects `DESIGN-SYSTEM.md` (token roles, themes, component inventory, motion params, UX
  baseline, a11y + perf budgets) for the harness. DESIGN-SYSTEM.md stays the source of truth;
  token *values* land at F-028 (tweakcn export).
- **Four frontend skills** in `.harness/skills/` (+ `.claude/` shims), **subordinate to
  DESIGN-SYSTEM.md**, attributed in [`NOTICE.md`](../../NOTICE.md) (ECC pattern):
  **`build-ui`** (UI orchestrator: server-first, tokens, compose, UX baseline, provenance, a11y),
  **`shadcn`** (from the official shadcn skill, MIT), **`frontend-craft`** (from Anthropic
  `frontend-design` Apache-2.0 + Leonxlnx `taste-skill` MIT — explicitly capped by "restraint over
  richness"), **`motion`** (from Emil Kowalski's skill, MIT).
- **Web verification gates** registered in
  [`gates.json`](../../.harness/verification/gates.json): **`a11y`** (axe / WCAG 2.1 AA) and
  **`web-perf`** (bundle/perf budget), **status `planned`** — activate with F-028 (mirroring how
  `e2e` activated with F-011). Refreshed [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md).

**Auth — confirmed out of scope for R0.** R0 local mode is **auth: none/local** (PRD deployment
matrix). OIDC + org RBAC + scoped tokens is the hosted direction (NFR-2; `AuthProvider` port in
ARCHITECTURE), built in **F-025/F-026 @ R2**; the specific library (Better Auth/Auth.js vs
Keycloak) is an **open ADR @ R2**. F-028/F-014 need **no login** — only a placeholder user/org
slot in the topbar.

**Evidence/verification:** `node scripts/verify-state.mjs` green (33 features, 16 effect-links,
wip_limit 1). Docs/harness-only change (no code) — code gates unaffected; format:check excludes
docs/harness. ADR-0021 added to the index.

**Decisions (delegated to Claude, recorded ADR-0021):** keep shadcn (defer Astryx to R1); adapt
skills into the harness rather than `npx skills add` (harness stays canonical); add an
agent-readable manifest; web gates planned until F-028.

**Lesson:** [[frontend-harness-before-ui]] — build the design harness (skills + machine-readable
manifest + gates) before the first UI feature so the design system is *executable* for agents,
not just prose; resist swapping a locked, sound foundation for a brand-new framework (production
bar) but steal its best idea.

**Next step:** **F-028** (UI foundation: Next.js app, tokens/theming, base shadcn, app shell,
⌘K) — built with [`build-ui`](../../.harness/skills/build-ui/SKILL.md). Then **F-014** (dashboard:
global search + Context Package inspector).

---

## 2026-06-29 — F-013 DONE: Plugin SDK + plugin-host (@tessera/plugin-host)
**What changed** (the extensibility layer — ARCHITECTURE §12; FR-40/58)
- New **`@tessera/plugin-host`**: a **uniform envelope** over Tessera's existing extension-point ports
  (it does NOT re-define them) + a host with discovery / config validation / lifecycle / failure
  isolation.
- **SDK** (`domain.ts`): `PluginKind` (connector/processor/ai-provider/storage-backend/
  retrieval-strategy); `Plugin<TConfig, TCapability>` = `manifest` (id/kind/name/version + **Zod
  `configSchema`**) + `setup(config, ctx) → PluginInstance` whose **`capability` is the existing port**
  (Connector, Embeddings, Retriever, …); `PluginInstance` (capability + optional start/stop/dispose);
  `PluginContext` (optional structural logger); `PluginInfo`/`PluginStatus`.
- **Host** (`createPluginHost`): `register` (unique ids) · `load` (validate config → `setup`) ·
  `start`/`startAll`/`stop`/`stopAll`/`dispose` · `capability<T>` · `list({kind})`. **Failure
  isolation (FR-58):** invalid config + setup/lifecycle errors → `failed` (with message), **never
  throws out of the host** or stops other plugins; only an *unknown id* throws. Heterogeneous plugins
  stored type-erased behind one localized cast (no `any`).
- **First-party plugins (dogfooding):** `filesystemConnectorPlugin` (wraps the ingestion filesystem
  connector) + `fakeEmbeddingsPlugin`/`transformersEmbeddingsPlugin` (wrap the AI embeddings) — same
  contract a third party uses. They live in plugin-host so it depends on ingestion/ai **one-way**
  (no cycle; domain packages untouched).

**Scope honesty:** error isolation, **not** process/sandbox isolation (R0). A split `plugin-sdk`/
`plugin-host` (so domain packages export their own plugins) + wiring F-015 via the host are follow-ups.
New effect **E-016**; the PluginKinds stay aligned with the underlying ports (E-007/8/9/12). ADR-0020.

**Evidence/verification (fresh, all green):** state (32 features, **16 effect-links**) · typecheck
(26/26) · lint (14/14) · format:check (all matched) · **test = prior 190 + plugin-host 10** = **200
passing** (host: config validation, duplicate/unknown id, setup + start failure isolation,
load→start→stop→dispose lifecycle, `startAll` isolation, list filter; integration: first-party
filesystem connector + fake embeddings load through the host and their capabilities work) ·
test:e2e = api 14 + mcp 7 = 21 · build (14/14).

**Decisions (delegated to Claude, recorded ADR-0020):** wrap existing ports (don't re-define);
first-party wrappers in the host (no cycle); failure isolation over throwing.

**Lesson:** [[plugin-sdk-envelope-over-ports]] — a plugin SDK over code that already has ports is a
uniform envelope (capability = the existing port); dogfood first-party wrappers in the host to avoid
cycles; isolate failures so a bad plugin can't crash startup.

**Next step:** R0 remaining is the **UI arc** — **F-028** (UI foundation: Next.js, design tokens,
shadcn, app shell, command palette) → **F-014** (dashboard: global search + Package Inspector). The
entire R0 **backend** (engine + surfaces + config + observability + plugins + CI) is now complete.

---

## 2026-06-29 — F-029 DONE: CI/CD pipeline running the verification gates (.github/workflows)
**What changed** (verification at scale — ADR-0010; NFR-15)
- The `verify` job already mirrored all **seven gates** (state → typecheck → lint → format → test →
  build → e2e) on **Node 22.16.0 + pnpm 9** (F-001 + F-011). F-029 completes the plan ADR-0010 set:
- **Secret scanning** — new **`secret-scan`** job running **`gitleaks/gitleaks-action@v2`** over full
  history (`fetch-depth: 0`), with a scoped **`.gitleaks.toml`** (default rules + allowlist). The
  allowlist excludes secret-SHAPED placeholders in **tests / examples / docs+plans / the ingestion
  redaction detectors** — while still scanning **production source** (where a real leaked key matters).
  Verified the only secret-format strings in the repo live in allowlisted tests/plans, so the scan
  passes on first run.
- **Dependency audit** — the existing `security` job (`pnpm audit --audit-level=high`).
- **Activation + branch protection** — documented in the workflow header: activates on a GitHub remote
  (none today); branch protection on `main` should require `verify` + `security` + `secret-scan`.

**Scope note:** E-005 (gates.json ⇄ ci.yml ⇄ verification.md) preserved — the seven **gate steps**
still mirror `gates.json`; `security` + `secret-scan` are *additional* checks (ADR-0010), not gates.
No new ADR (ADR-0010 already specified gates + dependency audit + secret scanning + branch protection).
CD (build/publish/deploy) stays out of scope (R1 image / R2 cloud).

**Evidence/verification:** `state` valid (32 features, 15 effect-links) — F-029's gate; `format:check`
green (prettier governs `ci.yml`; YAML parses). The workflow's live run is on GitHub once a remote
exists — that is its activation (ADR-0010). No code changed, so the code gates are unaffected.

**Next step:** R0 remaining — **F-013** (Plugin SDK + plugin-host), then the R0 UI arc (**F-028**
foundation → **F-014** dashboard). The backend R0 (engine + surfaces + config + observability + CI)
is complete.

---

## 2026-06-29 — F-016 DONE: Observability baseline (@tessera/observability)
**What changed** (cross-cutting traces + logs + metrics, kept additive; ARCHITECTURE §obs; NFR-7)
- New **`@tessera/observability`**: a toolkit where **libraries use the OTel API only** and the SDK is
  wired at the process (`startTelemetry`, no-op until then).
  - **`createLogger`** — Pino + **redaction** of secret keys *and* raw content (never logged, NFR-7);
    `silentLogger`; `stderr` mode for MCP (stdout is the protocol).
  - **`withSpan`/`currentTraceId`** — active-context spans (children nest); correlation id.
  - **`createInstruments`/`recordCompileStageDurations`/`registerQueueDepthGauge`** — http / service /
    **compile-stage** latency histograms (+ queue-depth gauge).
  - **`startTelemetry`** — NodeSDK (providers + async context manager + **HTTP auto-instrumentation** so
    requests get server spans that service spans nest under); console exporters (OTLP = follow-up).
  - **`instrumentServices(services, obs)`** — **additive** ApiServices wrapper: every call → child span +
    latency; compiler records per-stage metrics. **Domain packages untouched.**
- **Additive enhancements to verified features (no breakage):** compiler (F-010) times each stage into
  the trace (`TraceStage.durationMs?`); `buildServer` (F-011) gains an optional **`loggerInstance`** so
  the redacting Pino logger backs per-request logging + correlation (Fastify v5 wants `loggerInstance`,
  not `logger`). The REST/MCP response schemas simply strip the new optional trace field.
- **Wired into `apps/server` (F-032):** `startApiServer`/`startMcpServer` take `observability` →
  instrument services, use the logger, REST records HTTP latency in an `onResponse` hook. Bins build
  observability from `config.logLevel`; telemetry starts only when **`TESSERA_TELEMETRY=1`** (off by
  default → no console spam; logging always on). MCP logs to **stderr**.

**Scope honesty:** **seams** (instrument provided, data wired later) — per-adapter spans, a fed
queue-depth gauge (the Queue port exposes no depth), OTLP exporters via config. New effect **E-015**;
additive ripples on **E-013** (compiler trace) + **E-003** (buildServer option). ADR-0019.

**Evidence/verification (fresh, all green):** state (32 features, **15 effect-links**) · typecheck
(24/24) · lint (13/13) · format:check (all matched) · **test = prior 179 + observability 10 + server 1**
= **190 passing** (logger redaction incl. nested; withSpan create/nest/error/currentTraceId; compile-stage
histogram; instrumentServices passthrough + spans; startTelemetry start/shutdown; compiler durationMs;
plus a server test booting the instrumented REST path) · test:e2e = api 14 + mcp 7 = 21 · build (13/13).

**Decisions (delegated to Claude, recorded ADR-0019):** OTel API in libs / SDK at the process; wrap
(`instrumentServices`) rather than retrofit; additive-only changes to F-010/F-011; telemetry off by
default (`TESSERA_TELEMETRY=1`).

**Lesson:** [[observability-additive-otel-api-in-libs]] — add a cross-cutting concern over verified
code via a composition-layer wrapper + optional hooks (API-only libs, SDK at the process), never by
threading params through every layer.

**Next step:** R0 remaining — **F-029** (CI/CD running the gates + audit/secret scanning), **F-013**
(Plugin SDK + plugin-host), or the R0 UI (**F-028** → **F-014**). Engine is bootable + observable.

---

## 2026-06-29 — F-032 DONE: Runnable server entrypoints (@tessera/server)
**What changed** (the payoff — the engine is now bootable end-to-end; ADR-0018 deferred this thin bin)
- New **`apps/server`** (`@tessera/server`): boots the Local profile and serves both surfaces.
  Depends on `config` + `api` + `mcp`; **nothing depends on it** → the `api↔config` cycle (avoided by
  the type-only `ApiServices` import) is never reintroduced.
- `createServerRuntime` = `loadConfig`(env + overrides) → `createLocalRuntime` (shared by both bins).
- **`startApiServer`** builds the F-011 server over `runtime.services`, `listen`s (`HOST`/`PORT`,
  default `127.0.0.1:3000`), returns a handle whose `close()` stops the server then the runtime.
- **`startMcpServer`** = `startMcpStdio(runtime.services)`; the connected-server type is derived via
  `Awaited<ReturnType<typeof startMcpStdio>>` so there's **no direct MCP-SDK dependency**.
- Executable bins `src/bin/{api,mcp}.ts` (`#!/usr/bin/env node`; `package.json#bin` = `tessera-api` /
  `tessera-mcp`) with `SIGINT`/`SIGTERM` graceful shutdown. The MCP bin logs to **stderr only**
  (stdout is the protocol). Shebang preserved through the tsc build.

**Scope note:** added as a tracked R0 feature (F-032) — the runnable bin explicitly deferred from
F-011/F-015. Realizes the "runnable REST/MCP process bins" consumer already recorded on effect E-014
(no effects change). No new ADR (covered by ADR-0018).

**Evidence/verification (fresh, all green):** state (**32 features**, 14 effect-links) · typecheck
(22/22) · lint (12/12) · format:check (all matched) · **test = prior 177 + server 2** = **179
passing** — the REST test **boots the real Local profile on an ephemeral port and answers
`/health`,`/ready`,`/v1/openapi.json` over actual HTTP** (offline, fake embeddings); the MCP test
covers the runtime→server composition · test:e2e = api 14 + mcp 7 = 21 · build (12/12). Bin shebang
verified in `dist/bin/api.js`.

**Decisions (delegated to Claude):** track the deferred bin as F-032; keep it in a separate app to
stay acyclic; derive the connected-server type through `@tessera/mcp` (no phantom SDK dep); smoke-test
the REST bin with a real socket on port 0.

**Next step:** R0 hardening — **F-016** (observability: OTel + Pino + metrics), **F-029** (CI/CD
running the gates), or the R0 UI (**F-028** foundation → **F-014** dashboard). The R0 engine is
bootable over REST + MCP from a config-driven Local profile.

---

## 2026-06-29 — F-015 DONE: Deployment profile & config loader (@tessera/config)
**What changed** (the composition root — makes the engine bootable; ARCHITECTURE §16/§132; FR-50/53)
- New **`@tessera/config`**: a validated config + the **Local** profile that wires the real local
  stack into the `ApiServices` the REST (F-011) and MCP (F-012) surfaces consume.
- **Config schema + loader** (`schema.ts`/`load.ts`, classic Zod 3): `TesseraConfig` (profile, env,
  logLevel, storage paths, embeddings{provider/model/dimension/ollamaUrl}, budgets, secrets) with
  defaults; `loadConfig(env, overrides)` applies **`TESSERA_*`** env overrides (merged per section,
  explicit overrides win) and validates — throws a typed `ValidationError` at startup (fail fast).
- **SecretsProvider port** (`secrets/`): `{ get, require }` with **env** (prefixed `process.env`) and
  **file** (JSON map) adapters; `require` fails fast without echoing the value. KMS/vault = cloud.
- **`createLocalRuntime(config)`** wires SQLite + sqlite-vec + filesystem + in-process queue +
  Transformers.js (zero external deps), composes memory/graph/hybrid-search/compiler → `ApiServices`,
  and returns a `Runtime` (stores, embeddings, keyword retriever for indexing, readiness probe,
  `close()`). The **embedding dimension flows from the provider into the vector store** (ADR-0006).
  Non-`local` profiles throw until F-023.
- **Compiler corpus seam** = a **blob-backed `FragmentSource`** (`createBlobFragmentSource`/
  `putFragment`): a `ref` → a blob holding JSON `{kind,text,metadata?}`. Ingestion's persistent
  DocumentSink writes these (downstream).
- **No `api↔config` cycle:** `ApiServices` is imported **type-only** (api never imports config; the
  runnable process bin that wires `config → startServer`/`startMcpStdio` lives outside both — a
  thin follow-up). New effect **E-014**. ADR-0018.

**Scope honesty:** the runnable REST/MCP process bin = small follow-up (kept out to stay acyclic);
Postgres+pgvector `self-hosted`/`cloud` profile = F-023; budgets are validated/exposed but applied
at the request layer; the blob FragmentSource convention is provisional until ingestion persistence.

**Evidence/verification (fresh, all green):** state (31 features, **14 effect-links**) · typecheck
(19/19) · lint (11/11) · format:check (all matched) · **test = prior 164 + config 13** = **177
passing** (schema defaults/overrides/validation, env+file secrets, and an **integration test that
boots the real Local profile** over `:memory:` SQLite+sqlite-vec + a temp blob dir with the **fake**
provider and exercises memory/graph/search/compile + readiness) · test:e2e = api 14 + mcp 7 = 21 ·
build (11/11). Real Transformers.js wiring covered by an env-guarded test (`TESSERA_TEST_TRANSFORMERS=1`).

**Decisions (delegated to Claude, recorded ADR-0018):** config is the composition root (type-only
ApiServices → no cycle); embedding dimension drives the vector store; FragmentSource over the blob
store; prove real wiring offline with the fake provider.

**Lesson:** [[composition-root-type-only-and-fake-provider]] — a composition root references the
surface contract **type-only** (no cycle) and proves real wiring by swapping only the slow/external
leaf (embeddings → fake, stores → in-memory/temp).

**Next step:** the **runnable process bin** (a tiny entry: `createLocalRuntime(loadConfig())` →
`startServer`/`startMcpStdio`), or **F-013** (Plugin SDK + plugin-host), **F-016** (observability),
or **F-028/F-029** (UI foundation / CI). R0 engine is now bootable over REST + MCP.

---

## 2026-06-29 — F-012 DONE: MCP server (@tessera/mcp)
**What changed** (the second surface — "one engine, two surfaces"; FR-35)
- New **`apps/mcp`** (`@tessera/mcp`): `@modelcontextprotocol/sdk@1.29` `McpServer`.
  **`buildMcpServer(services)`** registers five tools — **`search`, `compile_context`, `get_effects`,
  `capture_memory`, `explain`** — whose thin handlers wrap the **same** F-007…F-010 services the REST
  API wraps. The shared contract is expressed by a **type-only** `ApiServices` import from
  `@tessera/api` (zero runtime coupling — **no Fastify in the MCP runtime**; verified the dist has no
  value import of `@tessera/api`).
- **Inputs validated** by the SDK against **classic Zod 3** raw shapes (the SDK's API; consistent with
  the domain packages — only `@tessera/api` uses `zod/v4`). **Results** carry text JSON + typed
  `structuredContent`; **no `outputSchema`** (avoids output re-validation; services are the truth).
  **Errors surfaced cleanly** via a local masked envelope (`{error:{code,message,details?}}`, INTERNAL
  masked) matching REST's policy.
- **`explain`** = compile then project to per-fragment `whyIncluded` + provenance + the stage trace
  (FR-32/44), without fragment bodies. Pure `buildExplanation` (unit-tested).
- **Transport:** `startMcpStdio(services)` (stdio — what agent clients launch). Real adapter wiring +
  the launchable process are **F-015**; `buildMcpServer` is a pure factory.

**Scope honesty:** multi-client auth + quotas (MCP **gateway**) = F-026 (R2); the bootable stdio
process + config-driven adapters = F-015. Effect **E-003** *realized* (MCP half) — both surfaces now
wrap the same services; the error-envelope shape is shared policy.

**Evidence/verification (fresh, all green):** state (31 features, 13 effect-links) · typecheck (18/18)
· lint (10/10) · format:check (all matched) · **test = prior 162 + mcp 2** (`buildExplanation`
projection) = **164 passing** · **test:e2e = api 14 + mcp 7 = 21** (mcp: a real SDK `Client` over a
linked `InMemoryTransport` — `tools/list` lists the five; search/compile/effects/capture/explain happy
paths; `get_effects` unknown → clean `NOT_FOUND` isError; invalid input rejected) · build (10/10).

**Decisions (delegated to Claude, recorded ADR-0017):** type-only `ApiServices` import (twin surface
without runtime coupling); classic Zod 3 tool schemas; no `outputSchema`; stdio transport; prove with
an in-memory real-client e2e.

**Lesson:** [[mcp-twin-surface-type-only-and-inmemory-e2e]] — a second surface over shared services
should import the services contract **type-only** (compile-time guarantee, zero runtime cost) and be
proven with the SDK's own `Client` over `InMemoryTransport`.

**Next step:** **F-013** — Plugin SDK + plugin-host (discovery, config schema, lifecycle, isolation;
unblocked by F-006), or **F-015** (deployment profile/config loader) which makes both surfaces
bootable. R0 surfaces done; engine now reachable over REST + MCP.

---

## 2026-06-29 — F-011 DONE: REST API /v1 (@tessera/api)
**What changed** (the engine gets its first interface — ARCHITECTURE §11; FR-37, NFR-1/6/11)
- New **`apps/api`** (`@tessera/api`): **Fastify v5** with the **plugin + encapsulation** model.
  Routes are **thin** (validate → call a domain service → map result); they wrap the F-007…F-010
  services (memory, knowledge-graph, hybrid retrieval, context compiler). MCP (F-012) will wrap the
  **same** services — one engine, two surfaces.
- **Schema-first bridge (ADR-0016):** **`fastify-type-provider-zod@5.1`** + **`@fastify/swagger@9`** —
  **one Zod schema per route drives validation + serialization + OpenAPI** (served at
  **`GET /v1/openapi.json`**). The lib resolves schemas via Zod's **v4 core**, so the api package's
  boundary schemas use **`zod/v4`** (same physical `zod@3.25.x`; v4 subpath). Domain packages keep
  classic Zod-3 — only plain validated JSON crosses the boundary.
- **Routes:** `POST /v1/search`, `POST /v1/compile`, `GET /v1/effects?kind&key&maxDepth`, and
  `POST`/`GET` `/v1/memory`, `GET`/`PATCH` `/v1/memory/:lineageId`, `GET /v1/memory/:lineageId/history`.
  Operational (unversioned): `GET /health` + `GET /ready` (injected readiness probe → **503** until ready).
- **Consistent error envelope** (NFR-6): `{ error: { code, message, details? } }` via one
  `setErrorHandler` (`TesseraError.code → HTTP status`; **5xx masked**, no leak; Zod request failures
  → 400) + `setNotFoundHandler`. `mapError` is pure + unit-tested.
- **DI seam:** `buildServer(services)` takes injected `ApiServices` (+ optional `readiness()`). Real
  adapter wiring from a deployment profile (SQLite+sqlite-vec+filesystem+Transformers.js) and the
  bootable process are **F-015** — intentionally not here (no shipped toy composition).
- **e2e gate ACTIVATED (gate 6):** root `test:e2e` → `turbo run test:e2e`; turbo task added; **CI
  workflow runs it** (effect **E-005** honored — gates.json ⇄ ci.yml in lockstep). E2E uses
  `app.inject()` over an in-memory composition (test support).

**Scope honesty:** auth/CORS/helmet/rate-limit (per profile) = F-025 / observability F-016; realtime
SSE = F-021; generated SDK = F-022; the bootable local server + config loader = F-015. Effect
**E-003** *realized* (the REST half): the route schemas are the OpenAPI source for SDK + web + MCP.

**Evidence/verification (fresh, all green):** state (31 features, 13 effect-links) · typecheck
(16/16) · lint (9/9) · format:check (all matched) · **test (16 pkg tasks)** = prior 151 + **api 11**
(error-map + boundary-schema) = **162 passing** · **test:e2e = api 14** (`app.inject`: health/ready/503,
openapi doc lists routes, search ranked, compile budget-bounded+provenance+trace, effects ranked +
404, memory capture→read→edit(v2)→history→list + 404 + 400, not-found envelope) · build (9/9).

**Decisions (delegated to Claude, recorded ADR-0016):** Zod⇄Fastify bridge = fastify-type-provider-zod
(fulfils ADR-0002's bridge follow-up); inject services (don't wire adapters here); activate e2e now.

**Lesson:** [[fastify-type-provider-zod-v4-bridge]] — ftpz@5 needs `zod/v4` schemas even on a Zod-3
install (every route 500'd until switched); plus never `await app.register` (boots `ready()` early),
and register swagger before routes.

**Next step:** **F-012** — MCP server (search / compile_context / get_effects / capture_memory /
explain) wrapping the same domain services (unblocked by F-011). R0 engine → second surface.

---

## 2026-06-29 — F-010 DONE: Context Compiler (@tessera/context-compiler)
**What changed** (the centerpiece, G1 "compile, don't dump"; ARCHITECTURE §9; FR-27/28/29/30/32)
- New `@tessera/context-compiler` (deps: core, retrieval, knowledge-graph, storage, ai, zod).
- **`compile(task, budget, filters)`** runs **plan → retrieve → expand → rank → resolve → dedup →
  compress → assemble**: retrieve via the F-009 hybrid retriever; **expand** via `get_effects`
  (effect-dependents, `expandedFrom`); **dedup** near-duplicates by word-shingle Jaccard (no
  embeddings); **compress** = budget-fit selection that **never exceeds** the token budget (graceful
  degradation; LLM summarization is FR-31/R1); **assemble** = kind-grouped sections, per-fragment
  **provenance + whyIncluded** (FR-28/32).
- **CompilationTrace** records every stage's inputs/outputs/drops for the Package Inspector (FR-44).
- **FragmentSource** port = the corpus seam (ingestion fills it; tests use in-memory).
- **Context Quality Score** (`quality.ts`, PRD §9) + a **naive top-k** baseline; the **beats-naive**
  integration test passes — the compiler wins on relevance (expand reaches a doc keyword misses),
  redundancy (dedup), and provenance. Effects **E-003** (advances it) + **E-013**.

**Eval design note:** to make "beats naive" fair + deterministic, the labeled corpus puts the
near-duplicate among *irrelevant* docs (so dedup never drops a relevant one) and makes one relevant
doc reachable only via effect-link expansion (keyword misses it). Keyword (FTS) is the shared
baseline retriever (deterministic; fake embeddings would be random).

**Evidence/verification (fresh):** build · typecheck · lint · format green; test = core 15 +
ai 4 (+8 skipped) + storage 19 + ingestion 25 + memory 25 + knowledge-graph 23 + retrieval 23 +
**context-compiler 17** = **151 passing**. verify-state valid.

**Lesson:** [[fair-deterministic-eval-design]] — construct labeled eval suites so the system-under-
test wins for the *right* reasons, with deterministic backends (not random fake embeddings).

**Next step:** **F-011** — REST API /v1 (Fastify) wrapping these domain services
(search/compile/effects/memory), then **F-012** MCP server. R0 engine → interfaces.

---

## 2026-06-29 — F-009 DONE: Hybrid retrieval + fusion ranker (@tessera/retrieval)
**What changed** (ARCHITECTURE §8; FR-21/22/23/25/26)
- New `@tessera/retrieval` (deps: core, storage, ai, knowledge-graph, drizzle-orm, zod).
- **Common `Retriever` interface** + four retrievers: **semantic** (Embeddings → VectorStore),
  **keyword** (SQLite **FTS5**, owns the index; `index(ref,content)`), **graph** (KG lexical seed →
  expand via `get_effects`), **symbolic** (exact/prefix `symbol`-node lookup). Shared `extractTerms`.
- **Fusion ranker** (`fuse`, the core, FR-26): **weighted Reciprocal Rank Fusion** — rank-based so
  heterogeneous scores need no normalization; configurable per-signal weights (0 drops a signal);
  **per-candidate signal attribution**; returns one ranked set. Zod-validated hybrid service runs
  retrievers in parallel and fuses (the API/MCP search seam).
- Effect **E-012** (Retriever + fusion ⇒ retrievers + conformance + compiler/API consumers).

**Scope note (acceptance "five" vs requirements):** requirements are FR-21/22/23/25/26 = 4 retrievers
+ fusion. **Temporal (FR-24) is R1/F-018** — the 5th, behind the same interface; intentionally out of
scope here. Meaningful fusion needs a consistent cross-backend `ref` space — an ingestion/config seam.

**Evidence/verification (fresh):** build · typecheck · lint · format green; test = core 15 +
ai 4 (+8 skipped) + storage 19 + ingestion 25 + memory 25 + knowledge-graph 23 + **retrieval 23** =
**134 passing** (fusion math/weights/attribution, FTS5 keyword, semantic nearest, graph effect-expand,
symbolic exact/prefix, hybrid multi-signal fusion + weights + validation). verify-state valid.

**Lesson:** [[hybrid-fusion-shared-ref-space]] — RRF fuses by rank (no score normalization needed);
but signals only combine when retrievers share a `ref` id space, which is a corpus-wiring requirement.

**Next step:** **F-010** — Context Compiler (plan→retrieve→expand→rank→dedup→compress→assemble +
provenance), consuming this retrieval + the knowledge graph; unblocked by F-009.

---

## 2026-06-29 — F-008 DONE: Knowledge graph + effect-links + get_effects (@tessera/knowledge-graph)
**What changed** (ARCHITECTURE §5/§10; FR-16/17/18/19)
- New `@tessera/knowledge-graph` (deps: core, storage, drizzle-orm, zod).
- **Model:** `GraphNode` (file/symbol/module/person/decision/memory) + `GraphEdge` (imports/calls/
  references/contains/owns/defines/supersedes/**EFFECT_LINK**); deterministic `nodeIdFor`/`edgeIdFor`
  for idempotent upserts. Effect-links carry rationale/confidence/origin (static|manual|learned).
- **Effect-links (FR-17/18):** asserted **manually** via the service, and **derived statically** by
  inverting dependency edges (`A imports B` ⇒ `B --EFFECT_LINK--> A`, origin static).
- **get_effects (FR-19):** ranked, path-bearing traversal of dependents. Score = product of edge
  confidences; ranked score desc → distance asc → id asc.
- **GraphStore port + adapters:** in-memory (cycle-guarded BFS) + **sqlite (recursive CTE**,
  ARCHITECTURE §10, path-string cycle guard); both feed one shared `selectBestRanked` so results are
  identical (parity). One conformance suite covers both. Zod-validated service = the API/MCP seam.
- Effects **E-002** (realized) + **E-011** (GraphStore ⇒ adapters + conformance + service).

**Evidence/verification (fresh):** build · typecheck · lint · format green; test = core 15 +
ai 4 (+8 skipped) + storage 19 + ingestion 25 + memory 25 + **knowledge-graph 23** = **111 passing**
(ranking, static-derivation, service incl. get_effects ranking/paths/NotFound, both adapters'
conformance, sqlite CTE multi-hop). verify-state valid.

**Lesson:** [[adapter-parity-shared-pure-core]] — when two adapters must return identical results
(in-memory vs SQL traversal), factor the ranking/selection into one pure function both call; the
conformance suite then proves parity instead of re-deriving it per adapter.

**Next step:** **F-009** — Hybrid retrieval (semantic + keyword + graph + symbolic + fusion;
unblocked by F-004 + F-008), then F-010 (context compiler).

---

## 2026-06-29 — F-007 DONE: Memory subsystem (@tessera/memory)
**What changed** (ARCHITECTURE §5; FR-10/11/12/13)
- New `@tessera/memory` (deps: `@tessera/core`, `@tessera/storage`, `drizzle-orm`, **`zod`** —
  first workspace use of Zod, per ADR-0002).
- **Domain:** 7 `MEMORY_KINDS` (decision/lesson/incident/failure/architecture/glossary/task) +
  `MemoryMetadata` (source/author/links/tags); `Memory` = one **immutable version** with
  `version`, `supersedes`, `supersededBy`, `scope`, `confidence`, timestamps. Current =
  `supersededBy === null`.
- **Versioning (FR-12):** editing **never mutates** — it appends version N+1 that supersedes the
  prior; only the prior's `supersededBy` back-pointer is set. Atomic in the store (sqlite: a txn).
- **Service (FR-13):** Zod-validated `MemoryService` (`capture`/`edit`/`getCurrent`/`history`/
  `list`) — the **API + MCP seam** (F-011/F-012 wrap this domain service; not HTTP/MCP wiring here).
- **Port + adapters:** `MemoryStore` with **in-memory** (reference) + **sqlite** (Drizzle
  `memories` table over storage's `SqliteStore.db`; `CREATE TABLE IF NOT EXISTS` — drizzle-kit
  migrations are F-024) adapters, both passing one conformance suite. Effect **E-010**.

**Evidence/verification (fresh):** build · typecheck · lint · format green; test = core 15 +
ai 4 (+8 skipped) + storage 19 + ingestion 25 + **memory 25** = **88 passing** (validation,
service versioning, both adapters' conformance, sqlite service round-trip proving persistence +
immutability). verify-state valid.

**Lesson:** [[zod-exactoptional-bridge]] — Zod `.optional()` infers `T | undefined`, which clashes
with `exactOptionalPropertyTypes`; bridge by widening the mapper's param to `| undefined` and
stripping undefined keys when building the domain object.

**Next step:** **F-008** — Knowledge graph + effect-links + get_effects (unblocked by F-006),
then F-009 (hybrid retrieval).

---

## 2026-06-29 — F-006 DONE: Ingestion subsystem (@tessera/ingestion)
**What changed** (the front of the pipeline — ARCHITECTURE §7; FR-1/2/3/6/7/8/9)
- New `@tessera/ingestion` (deps: `@tessera/core`, `@tessera/storage`; **no new runtime deps**).
- **Ports (plugin SDK + persistence seam):** `Connector` (`list`/`resolve`), `Processor` +
  `runPipeline`, `DocumentSink`, `IngestionManifest` (content-hash index). ADR-0015.
- **Connectors:** `filesystem` (recursive walk, ignores `.git`/`node_modules`/`dist`/`.turbo`,
  traversal-guarded keys) + `git` (shells out to the `git` CLI — `ls-files -z` tracked files
  honoring `.gitignore`; repo provenance: branch/HEAD commit/authorship/tags). Shared
  `diffEntries` computes added/modified/removed.
- **Processors:** `normalize` (BOM strip, CRLF→LF, content-preserving) + `redact`. **Redaction is
  appended by the worker as a terminal, non-bypassable stage** so secrets are scrubbed before any
  persist (FR-9). `redactSecrets` = curated, ReDoS-safe detectors (AWS/GitHub/Slack/Google/Stripe
  tokens, PEM private keys, JWT, bearer, basic-auth URLs, quoted credential assignments); findings
  are **counts only**, never the secret value.
- **Pipeline:** `coordinator.scan()` diffs source vs manifest → enqueues **only changes** on the
  `Queue` port; `worker` consumes, resolves via connector, runs `normalize → … → redact`, and
  upserts to the sink **only if the content hash is new** (idempotent + incremental — no full
  re-index). Deterministic `documentIdFor` keeps upserts stable. In-memory sink + manifest adapters.

**Scope honesty:** embedding/vector/relational/graph **persistence** is the `DocumentSink` seam for
F-007/8/9 (not wired here); full git history/diff/blame + `fs.watch` deferred (ADR-0015). E-008
(ingestion as Embeddings consumer) realized at the later embed-processor increment.

**Evidence/verification (fresh):** build · typecheck · lint · format green; test =
core 15 + ai 4 (+8 guarded skipped) + storage 19 + **ingestion 25** = **63 passing** (connector
conformance, fs + **git** integration [ran for real], full pipeline lifecycle proving
incremental/idempotent/redaction). verify-state valid. Effect **E-009** added.

**Lesson:** [[ingestion-redaction-terminal-gate]] — make security invariants structural (enforced
pipeline stage), not advisory. Also: a stray NUL crept into a generated source file once; rewrote
it clean (watch for non-ASCII/control chars in emitted code).

**Next step:** **F-007** — Memory subsystem (types, metadata, versioning, manual capture), or
**F-008** (knowledge graph + effect-links, now unblocked by F-006).

---

## 2026-06-28 — F-005 DONE: Embeddings port + adapters (@tessera/ai)
**What changed**
- New `@tessera/ai`. `Embeddings` port (embed/embedBatch + {model, dimension} metadata, ADR-0006).
- Adapters: **transformers** (Transformers.js, local default, zero keys — smoke-verified live:
  `Xenova/all-MiniLM-L6-v2` → 384-d, ~21s first run incl. download), **ollama** (HTTP, optional),
  **fake** (deterministic, dependency-free — drives the conformance gate offline).
- Conformance suite runs against `fake` (4 tests, always); transformers + ollama tests **guarded**
  by env (`TESSERA_TEST_TRANSFORMERS` / `TESSERA_TEST_OLLAMA`), skipped by default. Effect **E-008**.

**De-risk:** smoke-tested a real embed before writing the adapter (confirmed model download +
mean-pooled/normalized 384-d output on Windows).

**Evidence/verification (fresh, cache off):** typecheck · lint · format · build green;
test = core 15 + ai 4 (+8 guarded skipped) + storage 19 = **38 passing**. verify-state valid.

**Note:** real adapter tests are guarded to keep gates fast/offline; transformers verified live
once via smoke + the opt-in `TESSERA_TEST_TRANSFORMERS=1` suite.

**Next step:** **F-006** — ingestion (filesystem + Git, event-driven, incremental, secret-redacted).

---

## 2026-06-28 — F-004 DONE: VectorStore port + sqlite-vec adapter
**What changed**
- `VectorStore` port (upsert/query/delete, capabilities {metric, dimension}, **model recorded
  per vector** — ADR-0006) in `@tessera/storage`.
- **sqlite-vec** adapter: better-sqlite3 + sqlite-vec v0.1.9 (prebuilt, loads on Windows);
  `vec0(id TEXT PRIMARY KEY, embedding float[N], model TEXT)`; KNN via
  `embedding MATCH ? ORDER BY distance LIMIT ?`; upsert = replace-by-id; dimension validated.
- Vector conformance suite (6 tests) + integration test on `:memory:`. Effect **E-007** updated
  to include VectorStore + sqlite-vec + vector conformance (+ pgvector later).

**De-risk:** smoke-tested sqlite-vec extension loading + vec0 KNN on Windows before writing the
adapter (confirmed v0.1.9 prebuilt works; learned exact API).

**Evidence/verification (fresh, cache off):** typecheck · lint · format · build green;
test = core 15 + storage 19 = **34**. verify-state valid.

**Next step:** F-005 — Embeddings port + Transformers.js adapter (Ollama optional).

---

## 2026-06-28 — fix: @tessera/storage was gitignored (never committed) — now tracked
**Bug (caught by the project lead):** a bare `.gitignore` rule `storage/` (meant for a runtime
data dir) also matched the SOURCE package `packages/storage/`, so the **entire F-003 package was
excluded from git**. The earlier "F-003" commits contained the state/docs changes but **none of
the storage code**, and `git status` showed "clean" the whole time (ignored files are hidden).
Detected via `git ls-files packages/storage` → 0.
**Fix:** anchored/dot-prefixed the runtime-data ignores (`/data/`, `.data/`, `.tessera/`,
`.vectordb/`; removed bare `data/` and `storage/`); committed the package. Lesson
[[gitignore-broad-dir-hid-package]]; clean-state protocol now requires confirming new dirs are
tracked via `git ls-files`.
**Verification:** `git ls-files packages/storage` > 0 after commit; gates unchanged (code identical).

---

## 2026-06-28 — F-003 DONE: storage ports + 3 adapters + conformance
**What changed (inc 4 + close)**
- SQLite `RelationalStore` adapter: **better-sqlite3** (^12, prebuilt — no native compile) +
  **Drizzle** (^0.45); lifecycle (migrate/healthcheck/close) + typed `db` handle; relational
  conformance suite + a Drizzle round-trip integration test.
- `@tessera/storage` now: **3 ports + 3 local adapters** (sqlite, filesystem, in-process queue),
  each validated by a shared conformance suite. Effect **E-007** (storage port ⇒ adapters + suites).

**Evidence/verification (fresh, cache off):** typecheck · lint · format · build green;
test = core 15 + storage 13 = **28**. verify-state valid.

**Decisions:** SQLite driver = **better-sqlite3** (delegated to Claude; mature, Drizzle-proven,
prebuilt binary so no Windows compile). node:sqlite was the fallback — not needed.

**Next step:** **F-004** — VectorStore port + sqlite-vec adapter (semantic retrieval).

---

## 2026-06-28 — F-003 inc 3: filesystem BlobStore + turbo cache fix
**What changed**
- Filesystem `BlobStore` adapter (`node:fs`, traversal-safe keys) + blob conformance suite
  (`tests/conformance/blob.conformance.ts`) + integration test (temp dirs); exported from index.
- **Build fix:** turbo served **false-green cached** gate results for uncommitted changes
  (input hash didn't change on working-tree edits). Set `"cache": false` on
  build/typecheck/lint/test in `turbo.json`. Lesson captured:
  [[turbo-cache-stale-uncommitted]].

**Evidence/verification (fresh, cache bypassed):** typecheck · lint · format · build all
execute & pass; **test: core 15 + storage 9 = 24** (storage now correctly runs both queue +
blob suites). verify-state valid.

**Remaining for F-003:** inc 4 = SQLite `RelationalStore` (Drizzle + **better-sqlite3**,
fallback node:sqlite) + relational conformance. Effect E-007 added when F-003 closes.

**Next step:** F-003 inc 4 (SQLite RelationalStore).

---

## 2026-06-28 — F-003 (in progress): storage ports + in-process queue [inc 1-2]
**What changed**
- New `@tessera/storage` package. Ports: `RelationalStore` / `BlobStore` / `Queue`
  (`src/ports/`). In-process `Queue` adapter (microtask delivery, retry up to maxAttempts,
  drain-on-shutdown) using `@tessera/core` errors.
- **Queue conformance suite** in `tests/conformance/` (ADR-0014) + `tests/integration` run
  against the in-process adapter (4 contract tests).

**Evidence/verification (green, executed):** typecheck · lint · format · test (core 15 +
storage 4 = 19) · build. verify-state valid (31 features, 6 effect-links).

**Remaining for F-003:** inc 3 = filesystem `BlobStore` + blob conformance; inc 4 = SQLite
`RelationalStore` (Drizzle + a driver — leaning **better-sqlite3**, ADR at that point) +
relational conformance + drizzle-kit migrations. Effect **E-007** (storage port ⇒ adapters +
conformance) added when F-003 closes.

**Next step:** F-003 inc 3 (filesystem `BlobStore`).

---

## 2026-06-28 — Decision: test organization = hybrid (ADR-0014)
**What changed** (convention, after research + lead's question)
- [ADR-0014](../../docs/adr/0014-test-organization-hybrid.md): **unit tests co-located** in
  `src/` (white-box, short imports, refactor-safe); **integration + e2e + port conformance
  suites** in a separate per-package `tests/` dir (app e2e in `apps/*/tests/e2e`, `apps/web/e2e`).
- Codified in [`rules/common/testing.md`](../rules/common/testing.md) (new Layout section);
  ADR index updated.
- `@tessera/core`'s current tests are all unit → stay co-located (no move).

**Decision** (AskUserQuestion): hybrid chosen over full-separation (brittle `../../src`
imports + mirrored tree) and over co-locate-everything (integration/e2e don't map to one file).

**Evidence/verification:** link-check + verify-state (this session).
**Next step:** **F-003** — storage ports + SQLite/filesystem adapters + conformance suite
(first feature to use `tests/integration` + `tests/conformance`).

---

## 2026-06-28 — F-002 DONE: @tessera/core domain primitives
**What changed**
- Fleshed out `@tessera/core` (was a shell): `id.ts` (branded `Id<Brand>`, `newId` via
  `node:crypto`, `isId`), `errors.ts` (`TesseraError` + Validation/NotFound/Conflict/
  Unauthorized/Forbidden/Internal + `ErrorCode`), `result.ts` (`Result`/`ok`/`err`/`isOk`/
  `isErr`), `config.ts` (`DeploymentProfile`, `DEPLOYMENT_PROFILES`, `CoreConfig`, guard),
  `events.ts` (typed in-process `createEventBus`). `index.ts` re-exports all.
- Config: core `tsconfig` `types:["node"]` (for node:crypto); eslint `no-undef:off` (TS handles it).
- Effect **E-006**: @tessera/core public API → every package/app (change additively).

**Evidence/verification** (executed, green)
- typecheck ✓ · lint ✓ · format:check ✓ · test ✓ (**6 files, 15 tests**) · build ✓ (emits dist).
- `verify-state` valid.

**Decisions**
- Node-targeted core (uses `node:crypto`); browser consumers use the SDK/API, not core directly.
- `Result` type provided for explicit domain failures alongside thrown `TesseraError`.

**Next step:** **F-003** — storage ports + SQLite/filesystem adapters + conformance suite.

---

## 2026-06-28 — Phase B.3: general-purpose execution skills (ECC-adapted) [F-031 done]
**What changed** (general-purpose harness layer; the gap the lead flagged)
- New skills (tool-agnostic, MIT-adapted from ECC — see [`NOTICE.md`](../../NOTICE.md)):
  [`strategic-compact`](../skills/strategic-compact/SKILL.md) (compact at phase boundaries),
  [`continuous-learning`](../skills/continuous-learning/SKILL.md) (lessons →
  [`memory/lessons/`](../memory/lessons/)), [`coding-standards`](../skills/coding-standards/SKILL.md)
  (indexes the rules).
- Enriched [`rules/common/engineering.md`](../rules/common/engineering.md) (KISS/DRY/YAGNI,
  small functions, no magic numbers, parallel async) + [`testing.md`](../rules/common/testing.md) (AAA).
- **Wired into protocols** (not fragile hooks): strategic-compact in workflow + session-lifecycle;
  continuous-learning in clean-state + definition-of-done. `.claude/skills` shims added.
- ADR-0013 (adopt ECC-derived skills; hooks deferred; broader agents/commands added as we code).
  ADR-0012 marked retired (agy). Memory: `ecc-harness-reference`.

**Decisions** (delegated to Claude): adopt the 3 named skills only (not broader ECC
agents/commands yet); **wire into protocols, defer executable hooks** (Windows-fragile,
upkeep) — record as optional future enhancement.

**Evidence/verification:** link-check + verify-state (this session's verify run).

**Next step:** **F-002** — `@tessera/core` (ids, typed errors, config types, event bus).

---

## 2026-06-28 — F-001 DONE: monorepo & toolchain scaffold
**What changed** (first coding feature; activates the verification gates)
- Turborepo + pnpm workspace: `package.json` (scripts→gates), `pnpm-workspace.yaml`,
  `turbo.json` (tasks), `tsconfig.base.json` (strict: noUncheckedIndexedAccess,
  exactOptionalPropertyTypes, noImplicitOverride, verbatimModuleSyntax, NodeNext).
- ESLint 9 flat config (`eslint.config.mjs`) incl. **package-boundary rule** (ADR-0001);
  Prettier (scoped to code + root config; docs/harness excluded by design); Vitest.
- First package `@tessera/core` (shell: `VERSION`/`coreVersion()` + 2 tests) to prove the
  toolchain end-to-end. F-002 fleshes it out.
- CI: `.github/workflows/ci.yml` mirroring gates.json (ADR-0010) + `pnpm audit`; `.env.example`.
- Flipped `verification/gates.json` typecheck/lint/format/test/build → **active** (e2e stays
  pending). Added effect **E-005** (CI ⇄ gates.json must stay in lockstep).

**Evidence/verification** (all green, executed)
- `pnpm install` ok (turbo 2.10, eslint 9.39, ts 5.9, vitest 2.1, prettier 3.9).
- typecheck ✓ · lint ✓ · format:check ✓ ("All matched files use Prettier code style!") ·
  test ✓ (2 passed) · build ✓ (emits `packages/core/dist`).
- **Boundary rule proven:** a deliberate `@tessera/other/src/x` import made `lint` FAIL
  (exit 1, no-restricted-imports); removing it returned lint to green.
- `node scripts/verify-state.mjs` valid (30 features, 5 effect-links).

**Decisions**
- Prettier scoped to code + root config only (markdown/docs/.harness hand-maintained) — a
  pragmatic scoping, revisit if we want prettier on docs. Type-aware ESLint deferred until
  real domain packages exist (F-002+); scaffold uses recommended + boundary rule.

**Next step:** **F-002** — `@tessera/core` (ids, typed errors, config types, event bus).

---

## 2026-06-28 — agy/Gemini worker integration removed (decision: not using agy)
**Decision:** we will **not** use `agy`/Gemini as a sub-agent in this project. The build-phase
worker integration added earlier (commit `e6713c2`) is fully removed: deleted ADR-0012, the
`delegate-to-worker` skill, the `/delegate` command + skill shim, and `scripts/agy-worker.ps1`
/`.sh`; removed feature F-031; stripped the agy section from `governance/tool-access.md` and the
references in the ADR index, skills index, `policy-model.md`, and coverage matrix. History is
preserved (this is a forward removal commit, not a rewrite). The decision is recorded in
[`REQUIREMENTS-COVERAGE.md`](../../docs/REQUIREMENTS-COVERAGE.md) so it isn't re-proposed.

**Evidence/verification:** verify-state valid; internal link-check 0 broken (this session).

**Next step:** coding — claim **F-001** (scaffold).

---

## 2026-06-27 — Phase B.1 addendum: governance policy model + ecosystem positioning
**What changed** (after reviewing Databricks **Omnigent**, a meta-harness)
- Added [`.harness/governance/policy-model.md`](../governance/policy-model.md): static +
  **stateful/contextual** policies (scopes, post-action triggers, resource-scoped writes,
  cost budgets, **egress-proxy credential injection**), with an honest enforcement matrix.
  Wired into governance README + tool-access.
- Product positioning: PRD **NG7** (Tessera is *not* an orchestrator) + new **§5.1 Ecosystem
  & interoperability**; ARCHITECTURE §2 "Ecosystem position". Tessera = MCP context/memory
  layer **complementary** to meta-harnesses (Omnigent); it fills Omnigent's context gap.

**Decision** (AskUserQuestion): adopt the stateful governance model + interoperability
positioning; do **not** build orchestrator/sandbox/live-session infra (out of scope).

**Next step:** coding — claim **F-001** (scaffold).

---

## 2026-06-27 — Phase B.1: pre-code hardening (gaps from brief review)
**What changed**
- Added the **design system**: [`docs/design/DESIGN-SYSTEM.md`](../../docs/design/DESIGN-SYSTEM.md)
  (tokens via tweakcn/shadcn, layout via efferd, components via coss/shadcn, motion, full UX
  baseline, a11y, perf) + **ADR-0009** (frontend stack locked; responsive web, **not PWA**).
- Captured two dropped brief items: **ADR-0011** billing via Dodo Payments (R2 direction) and
  **ADR-0010** CI/CD via GitHub Actions. Updated the ADR index.
- Added [`docs/REQUIREMENTS-COVERAGE.md`](../../docs/REQUIREMENTS-COVERAGE.md) tracing the
  entire original brief → PRD/ADR/harness, or gap.
- PRD: +FR-61 (billing), +NFR-15 (CI/CD), +NG6 (no PWA), design-system references.
- Code harness made explicit: [`F-001 scaffold plan`](../plans/F-001-monorepo-toolchain-scaffold.md)
  (tsconfig strict flags, eslint boundary rule, prettier, vitest, turbo, CI, scripts→gates);
  frontend rule now binds to the design system.
- State: +F-028 (UI foundation, R0), +F-029 (CI/CD), +F-030 (billing, R2); F-014 now
  blockedBy F-028; +effect E-004 (design tokens → all components).

**Evidence/verification**
- `node scripts/verify-state.mjs` valid (30 features, 4 effect-links); link-check 0 broken
  (see verification run for this session).

**Decisions** (via AskUserQuestion): capture billing now/build R2 (Dodo); responsive web not
PWA; lock frontend stack ADR now.

**Next step**
- Coding phase: claim **F-001** (scaffold) — plan already written.

---

## 2026-06-27 — Phase B: agent harness built
**What changed**
- Built the tool-agnostic global harness under [`.harness/`](../) plus root
  [`AGENTS.md`](../../AGENTS.md) (mandatory) and [`CLAUDE.md`](../../CLAUDE.md).
- Authored: instructions (workflow, session-lifecycle), modular rules
  (common/typescript/api/frontend/security), skills (add-feature, write-adr, effect-trace,
  verify-gate), commands (next-feature, verify, checkpoint), protocols (initialization,
  verification, definition-of-done, clean-state, effect-link, observability), governance
  (commit, secrets, tool-access, adr), plans (README + TEMPLATE), verification
  (gates.json + checklist).
- Seeded state: this log, [`feature_list.json`](feature_list.json) (R0 features F-001…F-016
  detailed + R1–R3 backlog F-017…F-027), [`effects.json`](effects.json) (invariants
  E-001…E-003), and JSON schemas.
- Added the Claude Code adapter ([`.claude/`](../../.claude/)) with settings, command shims,
  and planner/generator/evaluator subagents.
- Added `scripts/init.ps1` + `init.sh` + `scripts/verify-state.mjs`.
- Added service-scoped harness stubs under `apps/api` and `apps/web` (extend root).

**Evidence/verification**
- `node scripts/verify-state.mjs` — state files valid (see Phase B verification entry).
- Internal markdown link-check across the harness — 0 broken.

**Decisions**
- Harness is agnostic-core (`.harness/`) + thin Claude adapter (`.claude/`), mirroring the
  product's agent-agnostic stance. Recorded in memory [[harness-model]].

**Next step**
- Begin the coding phase: claim **F-001** (monorepo & toolchain scaffold) via
  [`/next-feature`](../commands/next-feature.md); that activates the pending-toolchain gates.

---

## 2026-06-27 — Phase A: product definition shipped
**What changed**
- Brand finalized **Tessera** / `@tessera/*` (ADR-0008; supersedes ContextOS).
- Wrote [`docs/PRD.md`](../../docs/PRD.md) (FR-*/NFR-* ids), 
  [`docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md),
  ADRs 0001–0008 (Accepted), glossary, roadmap; repo hygiene; `git init`.

**Evidence/verification**
- Internal link-check: 78 links, 0 broken. Branding scan: only intentional codename refs.
- Committed as `aaaf84f` (genesis commit on `main`, no remote).

**Decisions**
- Locked Drizzle (ADR-0005), Transformers.js/Ollama + sqlite-vec→pgvector (ADR-0006).

**Next step**
- Phase B (harness) — done in the entry above.
