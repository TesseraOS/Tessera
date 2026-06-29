# Plan: F-015 Deployment profile & config loader (Local) with adapter wiring

- **Feature:** F-015 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-50 (deployment is configuration), FR-53 (secrets provider) — `docs/PRD.md`
- **Service / package:** `@tessera/config` (`packages/config`)
- **Author:** Claude (Opus 4.8) · **Date:** 2026-06-29

## Intent
Turn the two pure DI surfaces (REST F-011, MCP F-012) into a **bootable** system: a validated config
schema selects adapters/providers/budgets by **profile**, and the **Local** profile wires
SQLite+sqlite-vec+filesystem+Transformers.js with zero external deps into the `ApiServices` the
surfaces consume. Secrets come through a `SecretsProvider` port (env/file locally). "Done" =
`createLocalRuntime(loadConfig())` returns working, wired services.

## Approach
- **Config schema** (`schema.ts`, classic Zod 3): `TesseraConfig` = `{ profile, env, logLevel,
  storage{ sqlitePath, vectorPath, blobRoot }, embeddings{ provider, model?, dimension?, ollamaUrl? },
  budgets{ defaultContextTokens, retrievalLimit }, secrets{ provider, file? } }` with sensible
  defaults. `loadConfig(env=process.env, overrides?)` applies env-var overrides (`TESSERA_*`) then
  validates → typed config. Only `profile: 'local'` is wired now; self-hosted/cloud throw "F-023".
- **SecretsProvider port** (`secrets/`): `{ get(key), require(key) }`. Adapters: **env**
  (`process.env`, optional prefix) and **file** (JSON map). `require` throws a typed error if absent.
  Secrets are never logged.
- **Local profile** (`profiles/local.ts`) `createLocalRuntime(config, opts?)` (async — transformers
  loads a model): build adapters — `createSqliteStore` (+`migrate`), `createFilesystemBlobStore`,
  `createInProcessQueue`, embeddings (`transformers` default | `ollama` | `fake`), `createSqliteVecStore`
  (dimension = `embeddings.info.dimension`); domain stores `createSqliteGraphStore(db)` /
  `createSqliteMemoryStore(db)`; retrievers semantic/keyword/graph/symbolic → `createHybridRetriever`;
  `createContextCompiler({ retriever, fragmentSource, graphStore })`. Returns
  `Runtime { config, services: ApiServices, secrets, blob, relational, vector, queue, keyword, close() }`.
- **FragmentSource** (`fragment-source.ts`) `createBlobFragmentSource(blob)` wires the compiler's
  corpus seam to the filesystem **BlobStore**: a document ref → a blob holding JSON `{ kind, text }`.
  Ingestion's persistent DocumentSink that *writes* this is downstream; F-015 wires the read path.
- **Reuse:** all F-003/F-004/F-005/F-007/F-008/F-009/F-010 factories; `ApiServices` is a **type-only**
  import from `@tessera/api` (no cycle: api never imports config).

**Increments:** scaffold + deps → schema + loader (+test) → secrets port + env/file (+test) →
blob FragmentSource (+test) → local profile composition → integration test (in-memory/temp, **fake**
embeddings) → docs/ADR/record.

## Files to touch
- `packages/config/{package.json,tsconfig.json,README.md}`.
- `packages/config/src/{index,schema,load,fragment-source}.ts`,
  `src/secrets/{provider,env,file}.ts`, `src/profiles/local.ts`, `src/runtime.ts`.
- Tests: `src/schema.test.ts`, `src/secrets/secrets.test.ts`,
  `tests/integration/local-profile.test.ts`.
- `docs/adr/0018-config-loader-and-local-profile.md` + index; state (`progress.md`,
  `feature_list.json`, `effects.json` — new effect for the config/profile seam).

## Anticipated effects
- **New effect** (config schema + Local profile ⇒ adapter wiring + the surfaces' boot): changing the
  config schema or the wiring ripples to whoever boots a runtime (future REST/MCP process bins,
  F-023 Postgres profile). `SecretsProvider` is a port (env/file → KMS/vault, ARCHITECTURE §132).
- Consumes (no change to) every storage/ai/domain factory; type-only on `ApiServices` (E-003).

## Test plan
- **Unit:** schema defaults + validation failures + `TESSERA_*` env overrides; secrets env + file
  (`get`/`require`, missing → throws); blob FragmentSource round-trip + miss.
- **Integration:** `createLocalRuntime` with `:memory:` sqlite + temp blob dir + **fake** embeddings —
  capture a memory and read it back; seed a graph node + effect-link and `getEffects`; index content
  and `search`; put a doc blob and `compile`. Proves the wiring is real, **offline**. Transformers
  provider behind an env guard (no model download in CI). `close()` releases handles.

## Verification
`state · typecheck · lint · format:check · test · build` (F-015 has no e2e gate). Full workspace, green.

## Risks / open questions
- **Transformers is async + downloads a model:** `createLocalRuntime` is async; tests use the `fake`
  provider; a real transformers run is env-guarded (as F-005 did).
- **No `api↔config` cycle:** `ApiServices` imported **type-only**; api must not depend on config.
  The runnable process bin (config → `startServer`/`startMcpStdio`) is a thin follow-up that lives
  outside both to stay acyclic — not in this feature.
- **FragmentSource backing convention** (blob JSON) is provisional until ingestion persistence lands.
- No open `OQ*` blocks this.
