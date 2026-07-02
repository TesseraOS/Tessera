# Plan: F-019 — Compiler compression stage (citation-preserving)

- **Feature:** F-019 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-31
- **ADRs:** none new (fits ADR-0004 context-compilation; the F-010 compress stage explicitly left FR-31 for R1)
- **Package:** `@tessera/context-compiler` (extend) · **Author:** Claude · **Date:** 2026-07-02
- **Verification:** typecheck · lint · test (keep format + build green workspace-wide)

## Intent
Upgrade the compiler's **compress** stage (FR-31): instead of **dropping** a fragment that overflows the
remaining token budget, **compress it** — a deterministic, offline, query-relevant **extractive
summarization** — keeping the fragment's **citation** (its `ref` + provenance + "why included") intact and
**never exceeding the budget**. "Done" = a top-ranked but over-budget fragment contributes a relevant
excerpt (attributable to its ref) rather than being lost, and the package still fits the budget.

## Scope (acceptance is the contract — nothing more)
- **In:** an extractive `compressToFit(text, query, targetTokens)`; a compression-aware compress stage
  (`compressToBudget`) that compresses on overflow, preserves ref/provenance, and never exceeds budget;
  surfacing via the fragment's `whyIncluded` (original→compressed tokens) + a compress-stage trace note;
  unit + integration + regression (beats-naive) tests.
- **Deliberately out (noted honestly):** LLM/abstractive summarization and a **pluggable** compressor
  strategy port (that's F-020 — reproducibility + caching + pluggable stage strategies); a real
  tokenizer (the `estimateTokens` heuristic stays); per-fragment compression fields on the **API**
  schema (compression is surfaced through the existing `whyIncluded` + trace, so no cross-package schema
  change — an explicit field can be added when the inspector wants it).

## Approach — contained to the compiler package
The compress stage today (`fitToBudget`) fills in rank order and drops overflow. Change it so that, when a
fragment does not fit the **remaining** budget, it is **compressed to fit** rather than dropped:
1. `stages/compress-text.ts` (new): `compressToFit(text, query, targetTokens)` — split text into ordered
   **segments** (lines, then sentences), score each by **query-term overlap**, greedily select the
   highest-scoring segments that fit `targetTokens`, then **restore original order** and join. Deterministic
   (integer scores, index tie-breaks, `estimateTokens`). Returns `undefined` if not even one segment fits.
2. `stages/compress.ts`: `compressToBudget(items, budget, query)` — keep whole fragments that fit; for an
   overflowing fragment, if the remaining budget ≥ a small floor, `compressToFit` it and include the
   excerpt (marking `compressed: { text, originalTokens }`); else drop-and-continue (preserving graceful
   degradation for tiny leftovers). Never exceeds budget.
3. `stages/assemble.ts`: `toFragment` uses the compressed text when present and appends
   `"; compressed to fit budget (N→M tokens)"` to `whyIncluded` — the **citation is preserved** (same
   `ref`, provenance) and compression is visible in the API/inspector via the existing field.
4. `compiler.ts`: call `compressToBudget(deduped.kept, request.budget, request.task)`; add a compress-stage
   trace **note** summarizing compressed count + tokens saved.

## Files to touch
- `packages/context-compiler/src/stages/compress-text.ts` — **new** extractive compressor + its unit test.
- `packages/context-compiler/src/stages/compress.ts` — `compressToBudget` (replaces `fitToBudget`);
  `BudgetedItem` gains an optional `compressed` field (additive).
- `packages/context-compiler/src/stages/compress.test.ts` — update to the new name; add compression cases.
- `packages/context-compiler/src/stages/assemble.ts` — use compressed text + note in `whyIncluded`.
- `packages/context-compiler/src/compiler.ts` — call the compression-aware stage with the task as query +
  a trace note.
- (regression) the existing `compiler`/quality tests must stay green.

## Anticipated effects
- **E-013** (compiler pipeline + ContextPackage/trace): the compress stage now **compresses** rather than
  only dropping; `ContextFragment.text`/`whyIncluded` may reflect an excerpt. **No shape change** to
  `ContextPackage`/the API — compression rides the existing `whyIncluded` + trace notes, so REST/MCP/web
  (E-003) need no change. The internal `BudgetedItem` gains an optional field (additive).

## Test plan
- **Unit (`compress-text`):** picks query-relevant segments; preserves original order; never exceeds the
  target; returns `undefined` when a single segment can't fit; deterministic across runs.
- **Unit (`compress`):** whole fragments pass through; an over-budget multi-segment fragment is compressed
  to fit (not dropped) and marked; a single oversized un-splittable segment is still dropped (graceful);
  total never exceeds budget. Keep the existing never-exceed + graceful-skip assertions.
- **Integration (`compiler`):** a compile where a top fragment exceeds the budget yields a **compressed**
  excerpt carrying the same `ref`/provenance with a `whyIncluded` compression note, the package fits the
  budget, and the trace's compress stage notes the compression. Beats-naive/quality tests stay green.

## Verification
Workspace-wide: `node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` ·
`pnpm test` (compiler tests incl. new compression + unchanged quality/beats-naive; api/mcp/web unaffected) ·
`pnpm build`.

## Risks / open questions
- **Changing existing compress behavior** → the never-exceed-budget invariant and graceful-skip (single
  oversized segment) are preserved; existing tests updated only for the renamed entry point, and re-asserted.
- **Excerpt coherence** → segments restored to original order + a meaningful floor avoid 1-token noise;
  citation (ref/provenance) always preserved, so an excerpt is never mis-attributed.
- **Determinism** → integer overlap scores + index tie-breaks + the existing `estimateTokens` heuristic.
