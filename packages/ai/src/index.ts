/**
 * @tessera/ai — AI provider ports and adapters (ADR-0006).
 *
 * Embeddings port + adapters: Transformers.js (local default, no keys), Ollama (optional),
 * and a deterministic fake for tests. LLM ports arrive in later features.
 */
export * from './ports/embeddings.js';
export * from './adapters/fake/index.js';
export * from './adapters/transformers/index.js';
export * from './adapters/ollama/index.js';
