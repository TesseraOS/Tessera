/**
 * @tessera/config — deployment profiles, the validated config loader, and the secrets port
 * (ARCHITECTURE §16; FR-50/FR-53).
 *
 * `loadConfig()` validates a `TESSERA_*`-overridable config; `createLocalRuntime(config)` wires the
 * **Local** profile (SQLite + sqlite-vec + filesystem + Transformers.js, zero external deps) into the
 * `ApiServices` the REST (F-011) and MCP (F-012) surfaces consume. Secrets come through the
 * `SecretsProvider` port (env/file locally; KMS/vault for cloud).
 */
export * from './schema.js';
export * from './load.js';
export * from './secrets/index.js';
export * from './fragment-source.js';
export * from './runtime.js';
export * from './profiles/local.js';
// The profile selector (F-056) — what every process should boot through. `self-hosted.js` is
// deliberately NOT re-exported: it is reached by dynamic import so `pg`/`bullmq`/`ioredis` stay out
// of a Local process's module graph.
export * from './profiles/create-runtime.js';
export type { ProfileAdapters } from './profiles/assemble.js';
export * from './auth/sqlite-token-store.js';
export * from './projects/sqlite-project-store.js';
export * from './sources/sqlite-source-registry.js';
export * from './sources/sqlite-manifest.js';
// Postgres twins for the self-hosted profile (F-056, ADR-0059 §2) — same ports, same conformance.
// The audit log mirrors its SQLite twin in staying unexported: the composition root imports it
// directly, and it is not part of this package's public surface.
export * from './projects/postgres-project-store.js';
export * from './sources/postgres-source-registry.js';
export * from './sources/postgres-manifest.js';
export * from './auth/postgres-token-store.js';
export * from './sources/corpus-indexer.js';
export * from './sources/ingestion-sink.js';
export * from './sources/memory-indexing.js';
export * from './sources/search-enrichment.js';
export * from './sources/search-snippet.js';
export * from './symbols/tree-sitter-extractor.js';
