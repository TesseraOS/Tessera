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
export * from './auth/sqlite-token-store.js';
export * from './sources/sqlite-source-registry.js';
export * from './sources/sqlite-manifest.js';
export * from './sources/corpus-indexer.js';
export * from './sources/ingestion-sink.js';
export * from './sources/memory-indexing.js';
