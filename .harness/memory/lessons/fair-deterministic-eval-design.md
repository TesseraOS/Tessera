---
id: fair-deterministic-eval-design
kind: lesson
title: Design "beats baseline" evals so the system wins for the right reasons, deterministically
links:
  - packages/context-compiler/tests/integration/beats-naive.test.ts
  - packages/context-compiler/tests/integration/corpus.ts
  - packages/context-compiler/src/quality.ts
confidence: 0.85
created: 2026-06-29
---

**What happened:** F-010's acceptance requires the compiler to **beat naive top-k RAG** on a Context
Quality Score. A naive "two near-duplicate relevant docs + a query" corpus did **not** work: when the
duplicate is itself relevant, the compiler's dedup *drops a relevant fragment*, hurting its recall and
tying the baseline. Also, fake embeddings make semantic similarity effectively random, so a
semantic-top-k baseline would be non-deterministic/flaky.

**Why:** an eval only proves the thing you want if the corpus isolates the mechanism under test. Each
advantage must have a clean place to show up without a hidden cost cancelling it.

**How to apply — construct the suite so each win is attributable and the costs don't cancel:**
- Put the **redundancy among *irrelevant* docs**, so dedup improves precision without lowering recall.
- Make at least one **relevant doc reachable only via the new mechanism** (here: effect-link
  expansion the keyword baseline misses) — that's the recall win.
- Use a **deterministic retriever** as the shared baseline (FTS keyword), not random fake embeddings.
- Assert the *component* wins (relevance↑, redundancy↓, provenance↑), not only the aggregate — so a
  regression in one dimension is caught even if the weighted total still passes.

Generalizes to any "our approach > baseline" test (ranking, compression, caching). See
[[hybrid-fusion-shared-ref-space]] and [[adapter-parity-shared-pure-core]].
