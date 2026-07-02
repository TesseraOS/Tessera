/**
 * @tessera/context-compiler — the Context Compiler (ARCHITECTURE §9; FR-27/28/29/30/32; G1).
 *
 * compile(task, budget, filters) runs plan → retrieve → expand → rank → dedup → compress → assemble,
 * producing a provenance-tagged, token-budget-bounded Context Package with per-fragment "why
 * included" explainability and a full compilation trace for the Package Inspector. A Context Quality
 * Score lets it be measured against naive top-k RAG.
 */
export * from './domain.js';
export * from './ports/index.js';
export * from './tokens.js';
export * from './shingle.js';
export * from './scores.js';
export * from './strategies.js';
export * from './cache.js';
export * from './key.js';
export * from './stages/candidate.js';
export * from './stages/plan.js';
export * from './stages/expand.js';
export * from './stages/rank.js';
export * from './stages/resolve.js';
export * from './stages/dedup.js';
export * from './stages/compress.js';
export * from './stages/assemble.js';
export * from './compiler.js';
export * from './quality.js';
