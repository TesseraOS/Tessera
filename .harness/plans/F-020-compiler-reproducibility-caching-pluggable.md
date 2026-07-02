# Plan: F-020 — Compiler reproducibility + caching + pluggable stage strategies

- **Feature:** F-020 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-33, FR-34
- **ADRs:** none new (fits ADR-0004 context-compilation; extends F-010/F-019)
- **Package:** `@tessera/context-compiler` (extend) · **Author:** Claude · **Date:** 2026-07-02
- **Verification:** typecheck · lint · test (keep format + build green workspace-wide)

## Intent
Make the compiler **reproducible & cacheable** (FR-33) and its stages **pluggable** (FR-34): the same
inputs produce the same package (a deterministic **compilation key**), identical compiles are served from
an injectable **cache**, and the **ranker/compressor** can be swapped **without any API change**. "Done" =
a caller can inject a cache (repeat compiles short-circuit to the identical package) and swap the compressor
or ranker strategy, all with the `ContextPackage`/REST/MCP contract unchanged.

## Scope (acceptance is the contract — nothing more)
- **In:** `CompressionStrategy` + `RankStrategy` interfaces (defaults = current extractive compressor /
  relevance ranker) injected via compiler options; a `CompilationCache` port + an in-memory **LRU**
  adapter; a deterministic `computeCompilationKey(request, fingerprint)`; the compiler computes the key,
  checks/populates the cache, and drives the injected strategies; unit + integration tests.
- **Deliberately out (noted honestly):** exposing the key on the `ContextPackage`/API (kept internal to
  avoid a schema ripple — surfacing it is a follow-up seam); **fine-grained incremental recompute** of
  individual stages (this is whole-request memoization keyed on inputs — partial-stage caching is a later
  refinement); a persistent/shared cache backend (in-memory only; a store-backed cache can implement the
  same port); an LLM compressor (the strategy seam enables it, but no LLM here — local-first).

## Approach — contained to the compiler package (FR-34: "without API change")
Strategies are plain injected objects with an `id`; the compiler falls back to the current implementations,
so default behavior and the `ContextPackage` shape are unchanged. The cache is an injected port; when
present, `compile` computes a key from the **normalized** request (effective retrieval limit, sorted
filter kinds) + a **config fingerprint** (strategy ids + dedup/expand knobs), returns a cache hit verbatim
(true reproducibility — identical object), else runs the pipeline and stores it.

## Files to touch
- `packages/context-compiler/src/strategies.ts` — **new**: `CompressionStrategy` (+ `extractiveCompression`
  wrapping `compressToFit`) and `RankStrategy` (+ `defaultRankStrategy(multiSignalBonus)` wrapping
  `rankCandidates`).
- `packages/context-compiler/src/cache.ts` — **new**: `CompilationCache` port + `createInMemoryCompilationCache({ maxEntries })` (LRU).
- `packages/context-compiler/src/key.ts` — **new**: `CompilerFingerprint` + `computeCompilationKey` (sha256 of canonical JSON; deterministic, order-independent).
- `packages/context-compiler/src/stages/compress.ts` — `compressToBudget` gains an optional `compress`
  fn in its options (defaults to `compressToFit`) so the strategy can drive it.
- `packages/context-compiler/src/compiler.ts` — options gain `compression?`, `rankStrategy?`, `cache?`;
  build the fingerprint at creation; on `compile`, cache get/set around the pipeline; drive the injected
  ranker + compressor.
- `packages/context-compiler/src/index.ts` — export the new modules.
- Tests: `src/key.test.ts`, `src/cache.test.ts`, `tests/integration/reproducibility-cache.test.ts`.

## Anticipated effects
- **E-013** (compiler pipeline + options): new **optional** compiler options (strategies + cache) and a
  reproducibility key. **No `ContextPackage`/REST/MCP shape change** → E-003 (surfaces) untouched
  (FR-34's "without API change"). Existing default behavior preserved.

## Test plan
- **Unit (`key`):** same inputs → same key; different task/budget/kinds/strategy-id/dedup/expand → different
  key; filter `kinds` order-independent; effective vs explicit retrieval limit equivalence.
- **Unit (`cache`):** LRU get/set, recency bump, eviction past `maxEntries`.
- **Integration (`reproducibility-cache`):** with a call-counting fake retriever — first compile misses
  (retriever called), an identical second compile is a **cache hit** (retriever not called again) returning
  a package deep-equal to the first; a different request misses. Injecting a custom **compressor** strategy
  changes the excerpt (and the key); injecting a custom **ranker** strategy changes fragment order — both
  with an unchanged `ContextPackage` shape. Two compiles without a cache are **reproducible** (equal
  sections/scores/totalTokens). Existing compiler/beats-naive tests stay green (defaults unchanged).

## Verification
Workspace-wide: `node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` ·
`pnpm test` (context-compiler incl. new key/cache/strategy tests; api/mcp/web unaffected) · `pnpm build`.

## Risks / open questions
- **Determinism of the cached package** → a cache hit returns the stored object verbatim (identical), so
  reproducibility holds; only stage `durationMs` varies between fresh compiles (timing) — asserted by
  comparing sections/scores, not durations.
- **Key completeness** → the fingerprint includes every config knob + strategy id that affects output; a
  new output-affecting option must be added to the fingerprint (documented next to `computeCompilationKey`).
- **Default-behavior regression** → strategies default to the current implementations; existing tests
  (unchanged compiler construction) prove no behavior change.
