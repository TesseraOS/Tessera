# ADR-0024: GitHub connector via REST `fetch` + heuristic automatic memory extraction

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Project lead, Claude
- **Tags:** ingestion, connectors, memory, security, dependencies

## Context

F-017 is the first R1 feature. It adds two capabilities to `@tessera/ingestion`:

1. **FR-4** — ingest **pull requests and issues** from GitHub via a connector.
2. **FR-14** — **automatically extract memories** from ingested sources (ADRs, and now
   GitHub items).

Three forces needed a recorded decision:

- **How does the connector reach GitHub?** The precedent (ADR-0015) reads Git through the
  `git` CLI specifically to avoid a heavy JS dependency and keep the package dependency-free
  (local-first, NFR-1/3, minimal sensitive deps). The obvious choice for GitHub — Octokit —
  is a large dependency tree. Node ≥ 18 ships a global `fetch`, and the GitHub REST API is
  stable and simple.
- **Privacy (NFR-3).** Local mode must make **no network calls unless explicitly enabled**.
  A remote connector is inherently network-bound, so access must be opt-in and tests must
  never touch the network.
- **Where does auto-extraction live, and how does it write memories?** Extraction consumes an
  ingested `ProcessedDocument` (an ingestion type) and produces `Memory` captures (a
  `@tessera/memory` concern). A naive design would make `@tessera/ingestion` depend on
  `@tessera/memory`. We already avoid such couplings with type-only/structural seams
  (`@tessera/api`↔`@tessera/mcp`, the plugin-host first-party wrappers).

## Decision

**We will reach GitHub through the platform `fetch` behind a small injectable client, and
implement auto-extraction as deterministic extractors feeding a `DocumentSink` decorator via a
structural memory seam.**

- **`GitHubClient` port + `createRestGitHubClient`** — a narrow interface (`listIssues`,
  `getIssue`, `listIssueComments`, `getPullRequest`) implemented over global `fetch` (Bearer
  auth, `X-GitHub-Api-Version`, deterministic pagination, typed error mapping for
  401/403-rate-limit/404). **No Octokit** — `@tessera/ingestion` stays dependency-free,
  consistent with ADR-0015. The client is injected, so the connector is deterministic and
  tests drive it from an in-memory **fake** (the fake-embeddings pattern, F-005).
- **`createGitHubConnector`** implements the **existing** `Connector` port. Each issue/PR is a
  document at a synthetic path (`issue/{n}` / `pr/{n}`); the content hash is taken over the
  item's mutable fields so the F-006 pipeline processes it **incrementally and idempotently**,
  and the **terminal redaction gate** scrubs secrets from bodies/comments for free.
- **Network is opt-in (NFR-3).** The connector only reaches GitHub when a source is explicitly
  configured with a real client. Tests use the fake; a live smoke test is **env-guarded**
  (`TESSERA_TEST_GITHUB=1`) and skipped by default.
- **Auto-extraction** = pure, deterministic `MemoryExtractor`s (`adr-extractor`:
  `docs/adr/NNNN-*.md` → a `decision` from the **Decision** section; `github-extractor`: a
  **merged PR** → `decision`, a **closed issue** → `lesson`) plus **`createMemoryExtractionSink`**,
  a `DocumentSink` **decorator** that captures each candidate **idempotently** (keyed on
  `metadata.source` = `adr:NNNN` / `github:owner/repo#n`: supersede-on-change, skip-if-identical,
  never duplicate). **`teeSink`** fans out to a persistence sink + the extraction sink.
- **Structural memory seam.** The extraction sink depends on a locally-declared
  `MemoryCaptureService` (`capture`/`edit`/`list`), **not** on `@tessera/memory`. The real
  `MemoryService` is assignable to it; composition (config/server, F-015) wires the two. So
  `@tessera/ingestion` gains **no new runtime dependency and no package cycle**.

**Explicitly deferred:** commit-message extraction (needs per-commit ingestion the git connector
doesn't yet emit); LLM-based extraction/summarization (heuristic-only here, mirroring redaction);
wiring a GitHub source into the Local profile (F-015 seam); GitHub webhooks / realtime (F-021).

## Consequences

### Positive
- No new runtime dependency; the connector and extractors are deterministic and fully testable
  offline. Secrets can never reach memories (extraction runs on the **redacted** document).
- Re-using the `Connector`/`DocumentSink`/pipeline contracts means GitHub items are incremental,
  idempotent, and redacted with zero pipeline changes.
- The structural seam keeps package layering clean and acyclic.

### Negative / Costs
- We hand-maintain a thin GitHub REST client (pagination, error mapping) instead of Octokit —
  more code, and new endpoints must be added by hand.
- `CandidateMemoryKind` duplicates `@tessera/memory`'s `MEMORY_KINDS` (the price of the
  dependency-free seam); the two must be kept in sync.
- Heuristic extraction is conservative and can miss or mis-scope decisions; captures carry
  `confidence` < 1.0 and a `source` for audit/correction.

### Neutral / Follow-ups
- Wire a GitHub source + token (via the SecretsProvider) into the Local profile (F-015).
- Revisit LLM-assisted extraction and commit/PR-diff ingestion in a later increment.

## Alternatives considered

- **Octokit / `@octokit/rest`** — richer + typed, but a large dependency tree that contradicts
  the dependency-free stance (ADR-0015). Rejected for the same reason we shell out to `git`.
- **Extraction in `@tessera/memory` (import ingestion types)** — inverts the natural direction
  (memory is more foundational than ingestion) and couples memory to ingestion. Rejected.
- **A new `@tessera/auto-memory` package** — cleanest layering but more overhead than warranted;
  the structural seam achieves acyclicity without a new package. Deferred.
- **Extraction as a worker step (mutate the worker)** — would change the E-009 worker contract;
  a `DocumentSink` decorator is additive and composes via `teeSink`. Rejected.

## References

- Requirements: `docs/PRD.md` FR-4, FR-14; NFR-3 (privacy/data residency).
- Related: [ADR-0015](0015-ingestion-connector-contracts-and-git-cli.md) (ingestion contracts +
  dependency-free git), [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports &
  adapters). Effects: `E-009`, `E-010`, new `E-017` in `.harness/state/effects.json`.
