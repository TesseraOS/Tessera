/**
 * @tessera/storage — storage ports and their adapters (ADR-0003).
 *
 * Ports: RelationalStore, BlobStore, Queue. Local adapters: SQLite (Drizzle), filesystem,
 * in-process. Each adapter is validated by a shared conformance suite in `tests/`.
 */
export * from './ports/index.js';
export * from './adapters/in-process-queue/index.js';
export * from './adapters/filesystem-blob/index.js';
export * from './adapters/sqlite-relational/index.js';
