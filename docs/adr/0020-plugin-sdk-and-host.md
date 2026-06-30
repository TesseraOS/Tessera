# ADR-0020: Plugin SDK & host — a uniform envelope over existing ports, isolated lifecycle, first-party dogfooding

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** Project lead, Claude
- **Tags:** plugins, architecture, extensibility

## Context

Tessera is plugin-centric (ARCHITECTURE §12): new sources, processing stages, AI providers, storage
backends, and retrieval strategies should extend the engine without core changes (FR-40/58). The
five extension-point **contracts already exist as ports** in their packages (Connector/Processor in
`@tessera/ingestion`, Embeddings in `@tessera/ai`, the storage ports in `@tessera/storage`, the
Retriever in `@tessera/retrieval`). F-013 must add the **SDK + host** without re-defining or breaking
those ports, and prove first-party impls use the same contract as third parties.

## Decision

**1. The Plugin SDK is a uniform *envelope* over the existing ports, not new port definitions.** A
`Plugin<TConfig, TCapability>` = a `manifest` (id, `kind`, name, version, **Zod `configSchema`**) +
`setup(config, ctx) → PluginInstance`, where the **capability is the existing port** (a `Connector`,
`Embeddings`, `Retriever`, …). `PluginKind` enumerates the five extension points. This reuses the
stable contracts rather than duplicating them.

**2. The host owns discovery, config validation, lifecycle, and failure isolation.**
`createPluginHost()` provides `register` (unique ids), `load` (validate config against the plugin's
schema, then `setup`), `start`/`stop`/`dispose` (+ `*All`), `capability<T>`, and `list`. **Failure is
isolated:** an invalid config or a setup/lifecycle error marks the plugin `failed` (with the message)
and **never throws out of the host or stops other plugins**; only an *unknown id* throws (a
programming error). Heterogeneous plugins are stored type-erased behind a single localized cast (no
`any`).

**3. First-party plugins live in `@tessera/plugin-host` (one-way deps; no cycle).** The first-party
`filesystemConnectorPlugin` and `fakeEmbeddingsPlugin`/`transformersEmbeddingsPlugin` wrap the
existing factories. They live in the host package so it depends on `@tessera/ingestion`/`@tessera/ai`
**one way** — the domain packages stay untouched (no `domain → plugin-host` edge). This dogfoods the
contract (FR-40's "first-party uses the same contract as third parties") without retrofitting done
features.

## Consequences

### Positive
- One contract for every extension point; third parties implement the same `Plugin` the first-party
  plugins do. Config is validated before a plugin runs (FR-58); a bad plugin can't crash the host.
- Zero changes to the verified domain ports; the host is a thin, well-tested addition.

### Negative / Costs
- First-party plugin wrappers are centralized in the host rather than each domain package (so the
  host depends on those packages). Acceptable for R0; revisit with a split if needed.
- Isolation is **error** isolation, not process/sandbox isolation — a plugin still runs in-process.

### Neutral / Follow-ups
- A split `@tessera/plugin-sdk` (contracts only) + `@tessera/plugin-host` (runtime) if domain
  packages should export their own plugins (would let `ingestion`/`ai` own their wrappers).
- The deployment profile (F-015) could wire adapters **via** the host. Process/worker sandboxing and
  a richer `PluginContext` (capabilities injected to plugins) are later hardening.

## Alternatives considered

- **Define new plugin-specific port interfaces.** Duplicates the existing ports and risks drift.
  Rejected — wrap, don't re-define.
- **Put wrappers in each domain package (`ingestion`/`ai` export their plugins).** Cleaner ownership
  but requires a contracts-only package they depend on and edits to done features. Deferred (the
  split option above).
- **Throw on plugin failures.** Simpler, but a single bad plugin would crash startup. Rejected for
  failure isolation (FR-58).

## References

- Implements F-013. Adds effect **E-016**.
- Related: [ADR-0015](0015-ingestion-connector-contracts-and-git-cli.md) (Connector/Processor ports),
  [ADR-0006](0006-embeddings-and-vector-store.md) (Embeddings),
  [ADR-0018](0018-config-loader-and-local-profile.md) (composition root that may wire via the host).
  `docs/PRD.md` FR-40/FR-58; `docs/architecture/ARCHITECTURE.md` §12.
