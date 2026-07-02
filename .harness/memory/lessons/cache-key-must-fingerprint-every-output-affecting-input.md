---
id: cache-key-must-fingerprint-every-output-affecting-input
kind: lesson
title: A reproducibility/cache key must fingerprint every output-affecting input and strategy id
links:
  - packages/context-compiler/src/key.ts
  - packages/context-compiler/src/cache.ts
  - packages/context-compiler/src/compiler.ts
  - .harness/plans/F-020-compiler-reproducibility-caching-pluggable.md
confidence: 0.85
created: 2026-07-02
---

**What happened:** F-020 made the context compiler reproducible + cacheable and its ranker/compressor
**pluggable** — all via injected options, with no API change. The cache is keyed by
`computeCompilationKey(normalizedRequest, fingerprint)`. The correctness risk of any such cache is a
**too-narrow key**: if two configurations that produce *different* output map to the *same* key, the cache
serves a stale package. So the key folds in:
- the **normalized** request (the *effective* retrieval limit after defaults, and **sorted** filter kinds
  so order doesn't matter — `['a','b']` and `['b','a']` are the same compilation), and
- a **config fingerprint**: every output-affecting knob (`dedupThreshold`, `expandDepth`) **and each
  pluggable strategy's `id`** (`rankStrategy`, `compressionStrategy`). Swapping the compressor changes the
  output, so its `id` must change the key.

The trap is that pluggable strategies make the output depend on injected *behavior*, not just data — so
the strategy identity has to be part of the key, and every strategy needs a stable `id`.

**How to apply:**
- When you add memoization/caching keyed on inputs, enumerate **everything that can change the output** —
  request fields (normalized to effective values), config knobs, and the **identity of any injected
  strategy/plugin** — and hash a canonical (sorted/normalized) serialization of all of it.
- Give pluggable strategies a stable `id` and include it in the key; a nameless lambda can't be keyed.
- Put the fingerprint type right next to the key function with a comment: "add any new output-affecting
  option here" — the failure mode (stale cache hit) is silent, so make the invariant impossible to miss.
- Prefer returning a cache hit **verbatim** (identical object) when reproducibility is the goal; don't
  decorate it (e.g. a "cache hit" note) or you lose byte-identical reproducibility.
