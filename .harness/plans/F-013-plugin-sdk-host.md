# Plan: F-013 Plugin SDK + plugin-host (discovery, config schema, lifecycle, isolation)

- **Feature:** F-013 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-40 (plugin SDK), FR-58 (config-validated, isolated plugins) — `docs/PRD.md`
- **Service / package:** `@tessera/plugin-host` (`packages/plugin-host`)
- **Author:** Claude (Opus 4.8) · **Date:** 2026-06-29

## Intent
A uniform Plugin SDK + a host so new sources/stages/providers/backends/strategies extend Tessera
through **stable contracts** with config validation, lifecycle, and failure isolation — and so
first-party connectors/embeddings use the **same** contract as third parties.

## Approach
The extension-point contracts already exist as ports in their packages (Connector/Processor =
`@tessera/ingestion`, AIProvider = `@tessera/ai` Embeddings, StorageBackend = `@tessera/storage`,
RetrievalStrategy = `@tessera/retrieval`). F-013 adds the **uniform envelope** + the host — it does
**not** re-define those ports.

- **SDK** (`domain.ts`): `PluginKind`, `PluginManifest<TConfig>` (id/kind/name/version + Zod
  `configSchema`), `Plugin<TConfig, TCapability>` (`manifest` + `setup(config, ctx) →
  PluginInstance`), `PluginInstance` (`capability` + optional `start/stop/dispose`), `PluginContext`
  (optional structural logger), `PluginInfo`/`PluginStatus`.
- **Host** (`host.ts`) `createPluginHost(context?)`: `register` (unique ids), `load` (validate config
  against the schema → `setup`), `start`/`startAll`/`stop`/`stopAll`/`dispose`, `capability<T>`,
  `list`. **Failure isolation:** invalid config and setup/lifecycle errors mark the plugin `failed`
  (with the message) and **never throw out of the host** or stop other plugins; only an *unknown id*
  throws (a programming error). Heterogeneous plugins are stored type-erased behind a localized cast.
- **First-party plugins** (`plugins/`): `filesystemConnectorPlugin` (wraps the ingestion filesystem
  connector) and `fakeEmbeddingsPlugin` / `transformersEmbeddingsPlugin` (wrap the AI embeddings) —
  living in plugin-host so it depends on ingestion/ai one-way (no cycle; domain packages untouched).

## Files to touch
- `packages/plugin-host/{package.json,tsconfig.json,README.md}`.
- `packages/plugin-host/src/{domain,host,index}.ts`,
  `src/plugins/{filesystem-connector,embeddings}.ts`.
- Tests: `src/host.test.ts`, `tests/integration/first-party-plugins.test.ts`.
- State + ADR-0020 + effect (new) + progress.

## Anticipated effects
- **New effect** (Plugin SDK contract + host ⇒ the plugin kinds map to the existing ports; first-party
  + third-party plugins implement the same `Plugin`). Consumes (no change to) the ingestion/ai ports.

## Test plan
- **Unit:** config validation (valid → loaded; invalid → isolated `failed`); duplicate id →
  `ConflictError`; unknown id → `NotFoundError`; setup failure isolated; `load→start→stop→dispose`
  lifecycle + hooks; `startAll` isolates one failing plugin; `list` filter by kind.
- **Integration:** the first-party filesystem connector + fake embeddings plugins **load through the
  host** and their capabilities work (list files; embed to the configured dimension); invalid
  connector config → `failed`.

## Verification
`state · typecheck · lint · format:check · test · build`. Full workspace, green.

## Risks / open questions
- **No cycles:** first-party wrappers live in plugin-host (→ ingestion/ai one-way); domain packages
  don't depend on plugin-host. A split `plugin-sdk`/`plugin-host` is a later option if domain
  packages should export their own plugins.
- Heterogeneous registry typing handled by a single localized erased-plugin cast (no `any`).
- Process/worker isolation (sandboxing) beyond error isolation is out of scope (R0).
- No open `OQ*`.
