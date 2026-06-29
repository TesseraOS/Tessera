# Progress log

Session-by-session record so any agent can resume from files alone. Newest entries on top.
Each entry: date · what changed · evidence/verification · decisions · next step.

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
