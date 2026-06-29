# ADR-0018: Config loader & Local deployment profile — composition root, secrets port, blob-backed corpus

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** Project lead, Claude
- **Tags:** config, deployment, secrets, composition

## Context

F-015 turns the two pure DI surfaces (REST F-011, MCP F-012) into a **bootable** system: a validated
config selects adapters/providers/budgets by profile, and the **Local** profile wires the real local
stack into the `ApiServices` the surfaces consume (FR-50, FR-53; ARCHITECTURE §16/§132). Decisions:

1. **Where the composition root lives** and how it references the surfaces' service contract without
   creating a dependency cycle.
2. **How the embedding dimension reaches the vector store** (sqlite-vec needs a fixed dimension).
3. **How the compiler's corpus seam (`FragmentSource`) is backed** locally.
4. **The secrets contract** for local profiles.
5. **Keeping verification fast/offline** despite the default embeddings provider downloading a model.

## Decision

**1. `@tessera/config` is the composition root.** `createLocalRuntime(config)` constructs the
adapters and composes the domain services into an `ApiServices`, returned in a `Runtime` (with the
stores, embeddings, the keyword retriever for indexing, and `close()`). It imports `ApiServices`
from `@tessera/api` **type-only** — so `config` depends on `api`'s *type* with **no runtime edge and
no cycle** (`api` never imports `config`). The runnable process bin (config → `startServer` /
`startMcpStdio`) lives **outside** both packages to stay acyclic — a thin follow-up, not this feature.

**2. The embedding dimension flows from the provider to the vector store.** `createLocalRuntime`
builds the `Embeddings` first and passes `embeddings.info.dimension` to `createSqliteVecStore`, so
the vector index always matches the active model (ADR-0006) — no hard-coded dimension.

**3. The `FragmentSource` is backed by the filesystem `BlobStore`.** A document `ref` maps to a blob
holding JSON `{ kind, text, metadata? }` (`createBlobFragmentSource` + `putFragment`). This wires the
compiler's corpus seam to local storage; ingestion's persistent DocumentSink that *writes* these
blobs is downstream. The convention is provisional until ingestion persistence lands.

**4. `SecretsProvider` port with env + file adapters.** `{ get, require }`; `require` fails fast
(without echoing the value). `env` reads `process.env` under a configurable prefix; `file` reads a
JSON map. Cloud profiles implement the same port over KMS/vault.

**5. The integration test wires the real stack with the `fake` embeddings provider.** It uses
`:memory:` SQLite + sqlite-vec + a temp blob dir and exercises memory/graph/search/compile for real —
**offline and deterministic**. The default `transformers` provider (which downloads a model) is
covered by an **env-guarded** test (`TESSERA_TEST_TRANSFORMERS=1`), mirroring F-005.

## Consequences

### Positive
- The engine is bootable: one `createLocalRuntime(loadConfig())` yields working, wired services for
  both surfaces, with **zero external services or keys**.
- Profile-driven wiring isolates deployment choices; F-023 (Postgres+pgvector) adds a `self-hosted`/
  `cloud` branch behind the same `Runtime`/config without touching domain code.
- Config validation fails fast at startup; secrets never logged.

### Negative / Costs
- `config` depends on nearly every package (it is the composition root) — expected, but it must stay
  the only place that does this.
- The blob `FragmentSource` convention is provisional and must be matched by ingestion persistence.
- Budgets are validated/exposed in config but applied at the request layer (the compiler takes a
  per-request budget); fuller budget wiring is a small follow-up.

### Neutral / Follow-ups
- Runnable process bin (REST/MCP) wiring `createLocalRuntime` → `startServer`/`startMcpStdio`.
- Postgres/cloud profile = F-023; migration tooling = F-024.

## Alternatives considered

- **Compose services inside `apps/api`.** Would couple the HTTP app to storage choices and, with a
  process bin, create an `api↔config` cycle. Rejected — config is the composition root; api stays a
  pure surface.
- **Back `FragmentSource` with a relational `documents` table.** Viable, but invents more schema than
  a blob convention and still pre-empts ingestion's contract. Deferred; blob chosen for simplicity.
- **Real transformers in the integration test.** Honest but slow/networked in CI. Rejected for the
  default suite; kept behind an env guard.

## References

- Implements F-015. Adds effect **E-014** (config/profile ⇒ adapter wiring + the surfaces' boot).
- Related: [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters),
  [ADR-0006](0006-embeddings-and-vector-store.md) (model+dim), [ADR-0016](0016-rest-api-fastify-zod-bridge.md)
  / [ADR-0017](0017-mcp-server-surface.md) (the surfaces this boots).
- `docs/PRD.md` FR-50/FR-53; `docs/architecture/ARCHITECTURE.md` §16/§132.
