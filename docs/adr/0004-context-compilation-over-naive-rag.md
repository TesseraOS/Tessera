# ADR-0004: Context compilation over naive RAG

- **Status:** Accepted
- **Date:** 2026-06-27 (ratified; originally agreed 2026-06-25)
- **Deciders:** Project lead, Claude
- **Tags:** retrieval, core, product

## Context

The dominant pattern — embed everything, top-k nearest-neighbor lookup, paste chunks
into the prompt — produces noisy, redundant, provenance-free context. It ignores
structure (call graphs, ownership), recency, decisions/ADRs, and the **effects** of a
change. For coding agents this causes hallucinated APIs, "fixed one place, broke
three," and blown context budgets. This is the core of the product, not a detail.

## Decision

The heart of Tessera is a **Context Compiler**, not a retriever. Given a task, it runs
an explicit, inspectable pipeline:

```
plan → retrieve → expand → rank → dedup → compress → assemble
```

- **plan** — interpret the task; decide what kinds of context are needed and the token
  budget.
- **retrieve** — **hybrid** retrieval: semantic + keyword + graph + temporal + symbolic
  (see [ADR-0006](0006-embeddings-and-vector-store.md)).
- **expand** — follow knowledge-graph and **effect-links** to pull in dependents a
  change will touch.
- **rank** — score by relevance, recency, authority, and task fit.
- **dedup** — collapse near-duplicates and redundant restatements.
- **compress** — budget-aware summarization that preserves citations.
- **assemble** — emit a **Context Package**: ordered, sectioned, **provenance-tagged**,
  and explainable (every included fragment knows why it's there).

Every package is reproducible and debuggable from the dashboard.

## Consequences

### Positive
- Higher signal-to-noise within a fixed token budget; fewer agent errors.
- Provenance enables trust, auditability, and debugging ("why was this included?").
- The pipeline is a series of swappable stages — each independently improvable/testable.

### Negative / Costs
- Materially more engineering than top-k RAG; more moving parts to get right.
- Compilation latency must be controlled (caching, incremental recompute, budgets).

### Neutral / Follow-ups
- Each stage is a port with pluggable strategies; ship simple strategies first, improve
  per stage behind stable interfaces.
- Define package-quality metrics (relevance, redundancy, budget adherence) for eval.

## Alternatives considered

- **Plain vector RAG** — simplest, but is exactly the deficiency we exist to fix.
  Rejected as the core (still available as one retrieval strategy among several).
- **Pure long-context (stuff everything)** — expensive, lossy at scale, no provenance,
  no effect awareness. Rejected.

## References

- [ADR-0006](0006-embeddings-and-vector-store.md), `docs/PRD.md`,
  `docs/architecture/ARCHITECTURE.md`.
