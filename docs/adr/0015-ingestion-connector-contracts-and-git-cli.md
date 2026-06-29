# ADR-0015: Ingestion connector/processor contracts and Git via the `git` CLI

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** Project lead, Claude
- **Tags:** ingestion, ports-and-adapters, security, portability

## Context

F-006 builds the ingestion subsystem (`@tessera/ingestion`): the front of the pipeline in
[ARCHITECTURE §7](../architecture/ARCHITECTURE.md) — connectors emit change events, a worker
consumes them via the `Queue` port and processes them incrementally, idempotently, and with
secret redaction before persist (FR-1/2/3/6/7/8/9).

Two design forces needed a recorded decision:

1. **What are the stable contracts?** FR-7 requires connectors (and processors) to be **plugins**
   that add new sources/stages "without core changes." The architecture's port catalog
   ([§6](../architecture/ARCHITECTURE.md)) did not yet name the ingestion-side ports, and ingestion
   must persist *somewhere* without depending on the still-unbuilt relational/vector/graph schemas
   (F-007/F-008/F-009).
2. **How does the Git connector read a repository (FR-2)?** Options ranged from a pure-JS git
   library to shelling out to the installed `git` binary. This introduces either a heavy
   dependency or a runtime dependency on an external process — a portability and trust decision.

Constraints: local-first with **zero external services/keys** and minimal dependencies on
sensitive paths (NFR-1/3, security rule); ports & adapters (ADR-0003); production-grade only.

## Decision

**We will define four ingestion ports** as the plugin SDK and the persistence seam, and **read
Git through the `git` CLI**:

- **`Connector`** — `kind`, `list()` (current entries + content hashes), `resolve(path)` (full raw
  content). First-party `filesystem` and `git` connectors implement it; third-party sources use the
  same contract.
- **`Processor`** — `name`, `process(doc)`; composed by `runPipeline`. First-party `normalize` and
  `redact`. The worker composes `normalize → …user stages… → redact`, with **redaction appended as a
  terminal, non-bypassable stage** so secret scrubbing (FR-9) always precedes persistence regardless
  of pipeline configuration (defense in depth).
- **`DocumentSink`** — `upsert` / `remove`; the seam between ingestion and persistence. Ingestion
  ships an in-memory adapter; F-007/F-008/F-009 implement store-backed sinks. Ingestion therefore
  does **not** depend on downstream store schemas.
- **`IngestionManifest`** — a per-source `path → contentHash` index enabling incremental, idempotent
  processing (FR-8). In-memory adapter now; a relational-backed adapter adds durability later.

The Git connector **shells out to `git`** via `execFile` (fixed argument arrays, **no shell**;
ingested content is never executed) — `ls-files -z` for tracked paths (honoring `.gitignore`) plus
`rev-parse`/`tag`/`log` for repo-level provenance (branch, HEAD commit, authorship, tags). It does
**not** add a JavaScript git dependency. Full per-file history/diff/blame and `fs.watch` streaming
are deferred to a later increment; R0 captures HEAD provenance and scan-based change detection.

## Consequences

### Positive
- One small, stable plugin surface for sources and stages (FR-7); first-party connectors use the
  same contracts third parties will (ARCHITECTURE §12).
- Ingestion is decoupled from persistence via `DocumentSink`, so it could ship and be tested before
  the stores exist — no premature coupling to F-007/8/9 schemas.
- **Zero new runtime dependencies** (Node `fs`/`crypto`/`child_process` only); preserves the
  local-first, minimal-dependency promise. No native build, works on Windows.
- Redaction is structurally guaranteed to run before persist, not merely "a plugin you should add."

### Negative / Costs
- The Git connector requires the `git` binary on `PATH`. Absent it, the connector raises a typed
  error; its integration test probes and skips gracefully.
- Shelling out per scan has process-spawn overhead and parses CLI output (mitigated: `-z`/`%n`
  machine formats, fixed args). A library would avoid spawns but adds dependency/maintenance weight.
- `list()` reads file bytes to hash them every scan; only *changed* files are reprocessed/persisted
  (so no full re-index), but unchanged files are still re-hashed. An mtime/size fast-path is a
  future optimization.

### Neutral / Follow-ups
- Effect **E-009** records these contracts and their dependents.
- Later increments: durable (relational) manifest adapter; full git history/diff/blame; `fs.watch`
  streaming; chunk/extract/embed processors (the Embeddings consumer named in E-008); GitHub
  connector (F-017). Revisit the git-CLI-vs-library choice if non-trivial history walking is needed.

## Alternatives considered

- **`isomorphic-git` / `nodegit`** — a JS git implementation avoids the binary dependency, but
  `isomorphic-git` is a substantial dependency to maintain/audit on a sensitive path and `nodegit`
  needs native compilation (Windows friction). Rejected for R0; the `git` CLI is universally present
  in developer/CI environments and keeps the package dependency-free.
- **Persist directly to the relational/vector stores from the worker** — rejected: it would couple
  ingestion to schemas owned by later features and break one-feature-at-a-time. The `DocumentSink`
  seam defers that cleanly.
- **Redaction as just another optional processor** — rejected: a misordered or omitted pipeline
  could leak a secret to the sink. Making it an enforced terminal stage upholds FR-9 unconditionally.

## References

- Related: [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters),
  [ADR-0014](0014-test-organization-hybrid.md) (conformance suites),
  [ADR-0006](0006-embeddings-and-vector-store.md) (embeddings, a future processor).
- [`docs/PRD.md`](../PRD.md) FR-1/2/3/6/7/8/9; [ARCHITECTURE §7](../architecture/ARCHITECTURE.md);
  effect **E-009** in [`.harness/state/effects.json`](../../.harness/state/effects.json).
