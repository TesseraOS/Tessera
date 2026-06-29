# Plan: F-006 — Ingestion: filesystem + Git, event-driven, incremental, secret-redacted

- **Feature:** F-006 · **Requirements:** FR-1, FR-2, FR-3, FR-6, FR-7, FR-8, FR-9
- **ADRs:** 0001 (boundaries), 0003 (ports & adapters), **0015 (new — ingestion contracts + git-via-CLI)**
- **Package:** `@tessera/ingestion` (new) · **Author:** Claude · **Date:** 2026-06-29
- **Verification (per feature_list):** typecheck · lint · test (also keep format + build green)

## Intent
Stand up the **ingestion subsystem** front of the pipeline (ARCHITECTURE §7): first-party
**filesystem** + **git** connectors emit **change events**; an async **worker** consumes them
**via the Queue port** (`@tessera/storage`) and runs a **processor pipeline** that **normalizes**
and **scrubs secrets before persist**, writing to a **DocumentSink**. Processing is **incremental
& idempotent** via **content-hash diffing** against a **manifest** — no full re-index on small
changes. Connectors and processors are **plugins** behind stable contracts (FR-7).

## Scope (acceptance is the contract — nothing more)
- **In:** Connector + Processor + DocumentSink + IngestionManifest ports; filesystem + git
  connectors; normalize + redaction processors; content-hash diff; worker + coordinator wired to
  the Queue port; in-memory sink + manifest adapters; secret-redaction module; conformance +
  integration + unit tests.
- **Deliberately out (downstream, noted honestly):** embedding & vector/relational/blob
  *persistence* (sink is the seam → F-009/F-008/F-007 implement real sinks); symbol/memory
  extraction (F-008/F-017); knowledge-graph update (F-008); full git history/diff/blame walk and
  fs.watch streaming (R1+). Git connector captures **repo-level** authorship/branch/tag/HEAD-commit
  metadata (honors FR-2 intent) — not a per-file history walk.

## Domain (`src/domain.ts`)
`SourceDescriptor{id,kind,label}`, `ChangeKind = added|modified|removed`,
`ChangeEvent{source,path,changeKind,contentHash?}`, `RawDocument{path,bytes,contentHash,metadata}`,
`DocumentKind`, `ProcessedDocument{id,source,path,kind,contentHash,text,metadata,redactions[]}`,
`IngestionEvents` (typed bus: `document.ingested` / `document.removed`).
**Idempotency:** `documentIdFor(source,path)` = deterministic sha256(sourceId\0path) — never `newId`.

## Ports (`src/ports/*`, plugin SDK surface for FR-7)
- `Connector{ kind; list(): SourceEntry[]; resolve(path): RawDocument|undefined }` — `SourceEntry{path,contentHash}`.
- `Processor{ name; process(doc): ProcessedDocument }` + `runPipeline(processors, doc)`.
- `DocumentSink{ upsert(doc); remove({sourceId,path}) }`.
- `IngestionManifest{ snapshot(sourceId); get; set; delete }` (content-hash index).

## Connectors (`src/connectors/*`)
- `scan-diff.ts` — pure `diffEntries(current, prior) → ChangeEvent[]` (added/modified/removed). Unit-tested.
- `filesystem.ts` — recursive walk under `root` (skips `.git`,`node_modules`,`dist`,`.turbo` + caller ignores),
  read+sha256 each file; traversal-guarded keys (filesystem-blob pattern).
- `git.ts` — `git -C root ls-files -z` for tracked paths (respects .gitignore); read+sha256 working tree;
  repo metadata once/scan (`rev-parse`, `branch`, `tag --points-at`, `log -1`) onto doc metadata.
  Shells out via `execFile` (no shell, fixed args, `--` separators); probes `git --version`.

## Processors (`src/processors/*`)
- `normalize.ts` — strip BOM, CRLF→LF (safe, content-preserving). Binary (non-UTF8/NUL) → text `''`, kind `binary`.
- `redact-processor.ts` — wraps `redaction/redact.ts`. **Worker appends redaction as the terminal,
  non-bypassable gate** so scrubbing always precedes `sink.upsert` regardless of plugin order (defense in depth).

## Redaction (`src/redaction/redact.ts`, security-critical, FR-9)
`SECRET_DETECTORS` (named, bounded regexes: AWS key id, GitHub/Slack/Google/Stripe tokens, PEM private-key
blocks, JWT, bearer, basic-auth-in-URL, `password|secret|api_key|token=`); `redactSecrets(text) →
{ text, findings:[{detector,count}] }`. Replaces matches with `«redacted:<id>»`. **Never** stores/logs the
secret value (counts only). Heuristic/defense-in-depth — documented as conservative, not a guarantee.

## Pipeline (`src/pipeline/*`)
- `coordinator.ts` — `scan()`: `connector.list()` vs `manifest.snapshot()` → `diffEntries` → enqueue each
  `ChangeEvent` on topic `ingestion.change`; returns `{added,modified,removed,unchanged}`. Does **not**
  advance the manifest (worker does, after success → at-least-once + idempotent).
- `worker.ts` — `createIngestionWorker` subscribes to the topic. Handler (idempotent, retry-safe):
  removed → `sink.remove` + `manifest.delete`; else `connector.resolve` → run user pipeline → **redaction gate**
  → `sink.upsert` → `manifest.set` → emit `document.ingested`. Unresolvable file → treated as removed.

## Adapters (`src/adapters/*`)
- `in-memory-sink.ts`, `in-memory-manifest.ts` — for tests and as the seam downstream features replace
  with relational/vector/blob-backed implementations.

## Tests (ADR-0014; intra-package imports via `../../src` per F-003/4/5 convention)
- Unit (co-located): `redact.test.ts` (fake/example secrets — e.g. `AKIAIOSFODNN7EXAMPLE`), `scan-diff.test.ts`,
  `normalize.test.ts`, `hash.test.ts`.
- `tests/conformance/connector.conformance.ts` — every Connector: list returns entries with stable hashes;
  resolve returns content; same content → same hash (idempotent).
- `tests/integration/filesystem-connector.test.ts` — temp dir, run conformance + traversal guard.
- `tests/integration/git-connector.test.ts` — temp `git init`+commit, run conformance + metadata; **skips
  gracefully if `git` absent** (probe), mirroring F-005's guarded-real-dependency pattern.
- `tests/integration/ingestion-pipeline.test.ts` — end-to-end: coordinator→queue→worker→sink; asserts
  **(a)** initial ingest persists N redacted docs, **(b)** modify 1 → re-scan emits 1 change, only 1 re-upsert
  (no full re-index), **(c)** delete → sink.remove, **(d)** re-scan with no changes → 0 work (idempotent),
  **(e)** a planted secret never reaches the sink.

## Anticipated effects
New `@tessera/ingestion` + its contracts → new effect **E-009** (ingestion connector/processor/sink/manifest
contracts ⇒ first-party connectors + processors + conformance + downstream sink implementers F-007/8/9).
Touches **E-008** (ingestion is the named Embeddings consumer — embedding wired in a later increment, noted).

## Dependencies
`@tessera/core`, `@tessera/storage` (Queue port). Dev: `@types/node`. **No new runtime deps** (git via CLI,
fs/crypto via Node) — preserves local-first/zero-dep.

## Risks
- Git binary absent in some runners → connector throws typed error; integration test skips gracefully.
- Regex ReDoS in detectors → bounded quantifiers only; reviewed.
- Over-reach into downstream persistence → mitigated by the sink seam + explicit out-of-scope list.
