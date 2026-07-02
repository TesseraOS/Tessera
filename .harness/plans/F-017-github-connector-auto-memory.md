# Plan: F-017 — GitHub connector (PRs/issues) + automatic memory extraction

- **Feature:** F-017 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-4, FR-14
- **ADRs:** 0015 (ingestion contracts + git-via-CLI — the precedent), **0024 (new — GitHub-via-REST-fetch + heuristic auto-memory extraction)**
- **Package:** `@tessera/ingestion` (extend) · **Author:** Claude · **Date:** 2026-07-02
- **Release:** R1 (first feature) · **Verification:** typecheck · lint · test (keep format + build green workspace-wide)

## Intent
Add the **first remote source** (FR-4): a **GitHub connector** that ingests a repo's **PRs + issues**
(with comments) through the *existing* `Connector` port, so the incremental/idempotent/secret-redacted
pipeline (F-006) processes them unchanged. And close the loop on knowledge (FR-14): **automatic memory
extraction** that turns ingested **ADRs** and **merged/closed GitHub items** into captured **memories**
via the F-007 `MemoryService` — idempotently. "Done" = a configured GitHub source flows PRs/issues into
the pipeline, and ingesting an ADR/PR yields a `decision`/`lesson` memory without duplicates on re-scan.

## Scope (acceptance is the contract — nothing more)
- **In:**
  - `github` connector behind the existing `Connector` port (list/resolve), incremental via content-hash.
  - A thin injectable `GitHubClient` (native `fetch`, paginated, auth header) + a **fake** for tests.
  - Deterministic, rule-based **memory extractors** (`ProcessedDocument → CandidateMemory[]`) for ADRs
    and merged/closed GitHub items.
  - A `DocumentSink` **decorator** that runs extractors and captures via a **structural** memory-service
    seam (no new package dep), plus a `teeSink` to fan out to persistence + extraction.
  - Idempotent capture (re-ingest supersedes-on-change / skips-if-identical — never duplicates).
  - Unit + conformance + integration tests; **no network in tests**; env-guarded live GitHub test.
  - ADR-0024; effects traced (new **E-017**).
- **Deliberately out (noted honestly, deferred):**
  - Commit-message extraction (FR-14 example) — needs per-commit ingestion the git connector doesn't yet
    produce (it captures HEAD provenance only, ADR-0015). Extractors are shaped to accept it later.
  - LLM-based extraction/summarization — heuristic/deterministic only here (mirrors redaction's stance).
  - Wiring a GitHub source into `createLocalRuntime`/config (F-015) and a running scheduler — the connector
    is a package-level plugin like `filesystem`/`git`; profile wiring is a separate config concern.
  - Webhooks / real-time GitHub events (FR-38 = F-021); GitLab/Bitbucket providers.

## Approach — reuse first
The `Connector` port and the whole coordinator→queue→worker→sink pipeline (F-006) are **reused unchanged**.
A PR/issue is modeled as a **document**: `list()` enumerates items → `SourceEntry{ path, contentHash }`;
`resolve(path)` renders one item to a text `RawDocument` with GitHub provenance metadata. Because the
existing worker appends **redaction as a terminal gate**, secrets in issue/PR bodies are scrubbed before
persist for free (defense in depth — no special handling).

Auto-extraction is an **additive `DocumentSink` decorator** — not a worker change — so E-009's worker
contract is untouched. It depends on the memory service only **structurally** (a local
`MemoryCaptureService` interface with the two methods it needs), so `@tessera/ingestion` gains **no new
runtime dependency** and there is **no package cycle** (the Tessera type-only/structural-seam pattern from
`@tessera/api`↔`@tessera/mcp` and the plugin-host first-party wrappers).

### GitHub via native `fetch`, not Octokit
Consistent with ADR-0015 (git via CLI, no JS git dep): use Node 22's global `fetch` behind a small typed
`GitHubClient`, keeping the package dependency-free. Recorded in **ADR-0024**.

## New/changed files
- `src/connectors/github-client.ts` — `GitHubClient` interface (`listIssues`, `getIssue`, `listIssueComments`)
  + `createRestGitHubClient({ token, owner, repo, baseUrl?, fetchImpl? })`: Bearer auth, `X-GitHub-Api-Version`,
    cursor/`page` pagination, typed error mapping (401/403-rate-limit/404 → typed `@tessera/core` errors),
    `fetch` injectable for unit tests.
- `src/connectors/github.ts` — `createGitHubConnector({ owner, repo, client, include? })` → `Connector`
  (`kind: 'github'`). Path scheme `issue/{n}` / `pr/{n}`. `list()` hashes stable mutable fields
  (title, body, state, updatedAt, labels) — cheap, no per-item comment fetch. `resolve()` fetches the item +
  comments, renders deterministic markdown-ish text, attaches metadata
  `{ connector:'github', github:{ number, kind:'issue'|'pr', url, author, state, merged?, labels, createdAt, updatedAt } }`.
- `src/extraction/candidate.ts` — `CandidateMemory` (mirrors memory `capture` input: kind/title/body/scope/
  confidence/metadata{source,author,links,tags}) + `MemoryExtractor = (doc: ProcessedDocument) => CandidateMemory[]`.
- `src/extraction/adr-extractor.ts` — path `docs/adr/NNNN-*.md` (or metadata) → one `decision` memory
  (title from `# NNNN. …`, body = the **Decision** section if present else the doc, `source: 'adr:NNNN'`,
  `links: [path]`). Non-ADR → `[]`.
- `src/extraction/github-extractor.ts` — a **merged PR** or **closed issue** → one `decision`/`lesson`
  memory (`source: 'github:{owner}/{repo}#{n}'`, author, url in links). Open items → `[]`.
- `src/extraction/extract.ts` — `runExtractors(extractors, doc)` (dedup identical candidates).
- `src/adapters/memory-extraction-sink.ts` — `createMemoryExtractionSink(memory: MemoryCaptureService, extractors)`
  implementing `DocumentSink`; on `upsert`, run extractors and **idempotently** capture: look up current
  memory by `metadata.source`; identical body → skip; changed → `edit` (supersede); absent → `capture`.
  `remove` is a no-op (memories are versioned, never hard-deleted — F-007 invariant). `MemoryCaptureService`
  = structural `{ capture; edit; list }` subset.
- `src/adapters/tee-sink.ts` — `teeSink(...sinks: DocumentSink[])` → one `DocumentSink` fanning out.
- `src/index.ts` — export the new modules.
- `packages/ingestion/tests/integration/github-connector.test.ts` — conformance via a **fake** `GitHubClient`
  (no network) + an **env-guarded** (`TESSERA_TEST_GITHUB=1`, `GITHUB_TOKEN`) live smoke test (skipped by default).
- `packages/ingestion/tests/integration/auto-memory-extraction.test.ts` — full pipeline: filesystem connector
  over a temp dir (an ADR + a plain file) → worker → `teeSink(inMemorySink, extractionSink)` → assert the ADR
  produced a `decision` memory, the plain file produced none, and a **re-scan is idempotent** (no duplicate).
- Co-located unit tests: `github-client.test.ts` (fake `fetch`: pagination/auth/error map),
  `github.test.ts` (hash stability + incremental change), `adr-extractor.test.ts`, `github-extractor.test.ts`,
  `memory-extraction-sink.test.ts` (capture / skip-identical / supersede-on-change / tee fan-out).
- `docs/adr/0024-github-connector-and-auto-memory-extraction.md`.

## Anticipated effects
- **E-009** (ingestion contracts): realized further — `github` connector added under the *existing* `Connector`
  port (no contract change); the `teeSink`/extraction sink are new `DocumentSink` implementations.
- **E-010** (memory store/consumer): a **new consumer** of `MemoryService.capture/edit/list` (the extraction
  sink) — via a structural seam, so no hard dep.
- **New E-017** (auto-memory extraction seam): `ProcessedDocument` → `CandidateMemory` extractors →
  `MemoryCaptureService.capture` (structural). Dependents: extractors, the extraction sink, the memory service.
  Added to `effects.json` and F-017's `effects` at the trace step.

## Test plan
- **Unit:** GitHub REST client (fake `fetch` — pagination, headers, 403-rate-limit/404 mapping); connector hash
  stability + incremental-change; each extractor (positive + negative); extraction sink (capture / skip-identical /
  supersede-on-change) + tee fan-out. AAA, deterministic, offline.
- **Conformance:** run the existing `connector.conformance.ts` against the `github` connector (fake client).
- **Integration:** the end-to-end auto-memory-extraction pipeline test (idempotent re-scan). Env-guarded live
  GitHub connector test skipped unless `TESSERA_TEST_GITHUB=1`.

## Verification
Workspace-wide, per [`../protocols/verification.md`](../protocols/verification.md):
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test`
(new ingestion tests all green; prior suite unbroken) · `pnpm build`. Capture counts as evidence in `progress.md`.

## Risks / open questions
- **NFR-3 (privacy):** a network connector in a local-first product → **network only when a GitHub source is
  explicitly configured**; tests never hit the network (fake client); live test opt-in. State this in ADR-0024.
- **GitHub REST shape/pagination/rate limits** → thin typed client, `Link`/`page` pagination, typed rate-limit
  error; verified against the fake and (opt-in) the real API.
- **Extraction noise / false memories** → conservative rules (ADRs + merged/closed items only), deterministic,
  idempotent, `confidence` < 1.0, `source`-tagged for audit; LLM extraction explicitly deferred.
- **Dependency direction** → structural `MemoryCaptureService` seam keeps `@tessera/ingestion` dep-free and acyclic.
- **OQ:** none blocking. Config/profile wiring of a GitHub source is a deliberate follow-up (F-015 seam).
