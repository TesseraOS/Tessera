---
id: adapter-parity-shared-pure-core
kind: lesson
title: Keep multi-adapter results identical by sharing one pure core, proven by conformance
links:
  - packages/knowledge-graph/src/effects/ranking.ts
  - packages/knowledge-graph/src/adapters/in-memory-graph-store.ts
  - packages/knowledge-graph/src/adapters/sqlite-graph-store.ts
  - .harness/rules/common/testing.md
confidence: 0.9
created: 2026-06-29
---

**What happened:** F-008's `get_effects` is implemented two ways — an in-memory BFS and a SQLite
**recursive CTE**. Both must return the *same ranked list* (the conformance suite asserts exact
order/paths). Re-implementing the ranking in each adapter would let them drift.

**Why:** ports & adapters + a shared conformance suite (ADR-0003) only guarantees parity if the
*decision logic* is shared. The traversal mechanics legitimately differ per backend, but the part
that must be identical — dedupe-by-target and the sort (score desc → distance asc → id asc) — should
live in exactly one place.

**How to apply:** split such features into (a) a backend-specific step that *enumerates candidates*
(BFS rows / CTE rows) and (b) **one pure function** that turns candidates into the final result
(here `selectBestRanked`). Every adapter calls (b). Determinism matters: define explicit tie-breakers
so the order is total and stable. Then the conformance suite *proves* parity rather than each adapter
re-deriving it. Generalizes to retrieval fusion ranking (F-009) and compiler stages. See
[[engineering-standards]] and the testing rule (conformance suites).
