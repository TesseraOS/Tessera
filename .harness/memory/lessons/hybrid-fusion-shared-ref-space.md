---
id: hybrid-fusion-shared-ref-space
kind: lesson
title: RRF fusion ranks without score normalization, but needs a shared ref space to combine signals
links:
  - packages/retrieval/src/fusion/fuse.ts
  - packages/retrieval/src/domain.ts
  - docs/architecture/ARCHITECTURE.md
confidence: 0.85
created: 2026-06-29
---

**What happened:** F-009 fuses four heterogeneous retrievers (semantic/keyword/graph/symbolic) into
one ranked set. Their raw scores aren't comparable (cosine distance vs bm25 vs traversal score), so
the fusion uses **weighted Reciprocal Rank Fusion**: each candidate contributes `weight * 1/(k+rank)`
by its *rank*, not its score. This sidesteps score normalization entirely and is robust.

**The catch:** fusion only *combines* signals for an item when the retrievers return the **same
`ref`** for it. Semantic returns vector ids, keyword returns FTS row ids, graph/symbolic return node
ids — different id spaces. For signals to reinforce each other, ingestion/config must assign a
**consistent ref (e.g. a chunk/document id) across all backends**. That corpus-wiring is a separate
concern from retrieval itself; F-009 tests fusion with retrievers deliberately sharing a ref space.

**How to apply:** when fusing heterogeneous rankers, prefer rank-based fusion (RRF) over score
blending — fewer knobs, no normalization, weights still tune influence. But make the **shared
identifier across sources** an explicit design requirement of the ingestion/indexing layer, or the
"hybrid" fusion silently degrades to a concatenation of disjoint lists. Keep per-candidate
attribution so the inspector can show *why* an item ranked. See [[adapter-parity-shared-pure-core]].
