# Plan: F-010 — Context Compiler (@tessera/context-compiler)

- **Feature:** F-010 · **Requirements:** FR-27, FR-28, FR-29, FR-30, FR-32 · **ADRs:** 0004 (compile, not dump)
- **Package:** `@tessera/context-compiler` (new) · **Author:** Claude · **Date:** 2026-06-29
- **Verification:** typecheck · lint · test · effect **E-003**

## Intent
The product centerpiece (G1): `compileContext(task, budget, filters)` runs
**plan → retrieve → expand → rank → dedup → compress → assemble**, producing a **provenance-tagged,
token-budget-bounded Context Package** with per-fragment **why-included** explainability and a full
**compilation trace** for the inspector — and **beats naive top-k RAG** on a labeled suite by a
**Context Quality Score** (FR-27/28/29/30/32, ARCHITECTURE §9).

## Domain (`src/domain.ts`)
`CompileRequest {task, budget, retrievalLimit?, filters?{kinds?}}`; `Need {text, budget}`;
`FragmentProvenance {retrievalScore, signals: RetrieverKind[], expandedFrom?, source?}`;
`ContextFragment {ref, text, kind, tokens, score, provenance, whyIncluded}`;
`ContextSection {title, fragments}`; trace `TraceStage {stage,inputCount,outputCount,dropped[],notes?}`
→ `CompilationTrace {stages}`; `PackageScores {fragmentCount, budgetAdherence, provenanceCoverage,
redundancy}`; `ContextPackage {task, budget, sections, totalTokens, trace, scores}`.

## Port (`src/ports/fragment-source.ts`)
`FragmentSource { get(ref): Promise<SourceFragment | undefined> }` — resolves a retrieval `ref` to
its content (`{ref, text, kind, metadata?}`). The corpus seam (ingestion/blob store back it; tests
provide in-memory). Unresolvable refs are dropped + traced.

## Helpers
- `tokens.ts` — `estimateTokens(text)` = `ceil(len / CHARS_PER_TOKEN)` (4); deterministic budget basis.
- `shingle.ts` — word k-shingles + `jaccard` (near-duplicate detection, no embeddings needed for R0).

## Stages (`src/stages/*`, each small + swappable behind a stable signature)
- `plan.ts` `planNeeds(request)` → needs (R0: one need = task, full budget; multi-need-ready).
- retrieve (in `compiler.ts`): per need, `retriever.search(need)` → `FusedCandidate[]`; merge best-per-ref.
- `expand.ts` `expandCandidates(candidates, graphStore, opts)` → for each ref, `graphStore.getEffects`
  adds effect-dependents (score = parent × hit.score, `expandedFrom` set); best-effort (non-nodes → []).
- `rank.ts` `rankCandidates(candidates)` → score = retrievalScore × (1 + bonus·(signals−1)); sort desc.
- (resolve ranked candidates → fragments via FragmentSource; unresolvable dropped/traced)
- `dedup.ts` `dedupeFragments(frags, threshold)` → keep first of each near-dup cluster (exact hash +
  shingle Jaccard ≥ threshold); drops traced "near-duplicate of <ref>" (FR-30).
- `compress.ts` `fitToBudget(frags, budget)` → greedily include by rank while tokens ≤ budget; oversized
  dropped, smaller ones still fit (graceful degradation; **never exceeds budget** — FR-29). (LLM
  summarization is FR-31/R1 — out.)
- `assemble.ts` `assemble(request, selected, trace)` → sections (grouped by kind), per-fragment
  provenance + **whyIncluded** string (FR-28/32), totalTokens, `PackageScores`, full trace.

## Compiler (`src/compiler.ts`) — API/MCP-facing
`createContextCompiler({retriever, fragmentSource, graphStore?, weights?, dedupThreshold?})` →
`compile(request)`: Zod-validate → plan → retrieve → expand → rank → resolve → dedup → compress →
assemble. Every stage appends to the trace.

## Quality (`src/quality.ts`, acceptance bullet 4)
`computeContextQuality(pkg, {relevant:Set<ref>})` → CQS {relevance (F1 of included vs relevant),
redundancy (from pkg), budgetAdherence, provenanceCoverage, overall (weighted)}. `naiveTopKPackage(
retriever, request, fragmentSource, k)` = raw top-k, **no** dedup/expand/provenance/budget — the baseline.

## Tests (ADR-0014; intra-package imports via `../../src`)
- Unit: `tokens.test.ts`, `shingle.test.ts`, `dedup.test.ts` (near-dup dropped), `compress.test.ts`
  (never exceeds budget; graceful), `rank.test.ts`, `quality.test.ts` (CQS components).
- Integration: `compiler.test.ts` — full pipeline yields a budget-bounded, provenance-tagged,
  sectioned package + non-empty trace with stage drops; every fragment has why-included.
- Integration: `beats-naive.test.ts` — on a labeled suite (corpus with near-dup + a graph-linked
  relevant doc the keyword baseline misses), **CQS(compiler) > CQS(naive top-k)**.

## Scope (acceptance is the contract)
- **In:** the 7-stage pipeline; budget-bounded provenance-tagged package; dedup + why-included; trace;
  CQS + beats-naive eval.
- **Out:** LLM/abstractive compression (FR-31/R1/F-019); reproducibility/caching + pluggable-per-stage
  config (FR-33/34/R1/F-020); embedding-based dedup (R0 uses shingles); multi-need decomposition depth.

## Dependencies
`@tessera/core`, `@tessera/retrieval`, `@tessera/knowledge-graph`, `zod` (src); `@tessera/storage`,
`@tessera/ai` (tests build retrievers). No new native deps.

## Anticipated effects
Realizes **E-003** (REST/MCP contracts include compile) partially — the compiler is the domain the
API/MCP `compile_context` wraps. New effect **E-013** (Context Compiler pipeline/stages + ContextPackage
+ trace ⇒ API/MCP compile F-011/F-012 + web Package Inspector F-014; consumes retrieval E-012, KG E-011).

## Risks
- Fair, deterministic "beats naive" eval → use the keyword (FTS) retriever as the shared baseline
  retriever (meaningful + deterministic; fake embeddings would be random); compiler wins via
  dedup + graph-expand + provenance + budget. Documented.
- Token estimate is heuristic → fine for budget bounding; real tokenizer is a later refinement.
