/**
 * @tessera/knowledge-graph — the project knowledge graph + effect-links (ARCHITECTURE §5/§10).
 *
 * A relational node/edge model (files/symbols/modules/people/decisions/memories) with typed
 * effect-links ("change A ⇒ review B"; rationale + confidence + origin) derived statically from the
 * import/call graph and assertable manually, plus get_effects: a ranked, path-bearing traversal of
 * dependents (FR-16/17/18/19). Storage is behind the GraphStore port: in-memory + SQLite (recursive
 * CTE traversal). Populating nodes from code (symbol extraction) is a downstream ingestion concern.
 */
export * from './domain.js';
export * from './validation.js';
export * from './ports/index.js';
export * from './effects/ranking.js';
export * from './effects/static-derivation.js';
export * from './service/knowledge-graph-service.js';
export * from './adapters/in-memory-graph-store.js';
export * from './adapters/sqlite-graph-store.js';
