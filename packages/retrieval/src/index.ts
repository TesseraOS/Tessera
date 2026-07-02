/**
 * @tessera/retrieval — hybrid retrieval (ARCHITECTURE §8; FR-21/22/23/25/26).
 *
 * Retrievers behind one Retriever interface — semantic (VectorStore), keyword (SQLite FTS5), graph
 * (knowledge-graph traversal), symbolic (exact symbol lookup) — combined by a weighted
 * reciprocal-rank fusion ranker (configurable weights + per-candidate signal attribution) into one
 * ranked candidate set. Temporal (FR-24) is the fifth signal behind the same interface.
 */
export * from './domain.js';
export * from './ports/index.js';
export * from './util/text.js';
export * from './fusion/fuse.js';
export * from './adapters/semantic-retriever.js';
export * from './adapters/keyword-retriever.js';
export * from './adapters/graph-retriever.js';
export * from './adapters/symbolic-retriever.js';
export * from './adapters/temporal-retriever.js';
export * from './service/hybrid-retriever.js';
