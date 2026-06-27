# Tessera — Glossary

Shared vocabulary for the project. Terms here are the canonical definitions; code, docs,
and the dashboard should use them consistently. (This file is also a candidate seed for
the in-repo `glossary` memory type — PRD FR-10.)

| Term | Definition |
|------|------------|
| **Tessera** | The product. A *tessera* is a single mosaic tile — the metaphor for assembling scattered knowledge fragments into one coherent context. |
| **ContextOS** | The internal codename only. Not used in product-facing material ([ADR-0008](adr/0008-brand-tessera-and-package-scope.md)). |
| **Context Package** | The compiled output: an ordered, sectioned, **provenance-tagged**, budget-bounded bundle of context produced for a specific task. |
| **Context Compiler** | The pipeline that produces a Context Package: `plan → retrieve → expand → rank → dedup → compress → assemble` ([ADR-0004](adr/0004-context-compilation-over-naive-rag.md)). |
| **Compilation trace** | The recorded inputs, candidates, scores, and drops for each compiler stage; powers the dashboard's Package Inspector. |
| **Effect-link** | A typed graph edge meaning "changing A requires reviewing/changing B," with `rationale`, `confidence`, and `origin` (`static`/`manual`/`learned`). |
| **Hybrid retrieval** | Combining semantic + keyword + graph + temporal + symbolic retrievers via a fusion ranker, rather than vector-only search. |
| **Fusion ranker** | The component that merges multiple retrievers' results into one ranked candidate set with signal attribution. |
| **Knowledge graph (KG)** | The graph of project entities (files, symbols, modules, people, decisions, memories) and their typed relationships. |
| **Memory** | A first-class stored unit of project knowledge with a `kind` (decision/ADR, lesson, incident, failure, architecture, glossary, task), metadata, and version. |
| **Memory type** | The category of a memory; each may have its own retention and extraction rules. |
| **Provenance** | The recorded source/lineage of any fragment (where it came from, when, by whom) — attached to every item in a Context Package. |
| **Port** | A domain-defined interface (hexagonal architecture) that infrastructure implements. |
| **Adapter** | A concrete implementation of a port for a specific backend (e.g. sqlite-vec vs pgvector). |
| **Deployment profile** | The configuration that wires ports to adapters and selects providers/budgets for a deployment mode. |
| **Deployment mode** | One of Local / Self-Hosted / Managed Cloud / Enterprise — all the same codebase ([ADR-0003](adr/0003-local-first-cloud-ready-ports-and-adapters.md)). |
| **Connector** | A plugin that ingests from a source (filesystem, git, GitHub, chat, …). |
| **Processor** | A plugin stage in the ingestion pipeline (normalize/chunk/extract/redact/embed). |
| **MCP** | Model Context Protocol — the agent-facing tool interface Tessera exposes. |
| **MCP gateway** | A multi-client broker in front of MCP tools adding auth + quotas (R2). |
| **Conformance suite** | The shared test suite every adapter of a port must pass to guarantee cross-deployment parity. |
| **Harness** | The in-repo system (rules, skills, protocols, governance, state, memory) that governs how agents build Tessera (`.harness/`, created in Phase B). |
| **System of record** | The committed, authoritative state (feature list, effects, progress, memory, ADRs) — the repository, not the chat. |
| **Context Quality Score** | The north-star metric = f(relevance, low-redundancy, budget-adherence, provenance-coverage). |
| **R0 / R1 / R2 / R3** | Release milestones: Local MVP / Team-Self-Hosted / Managed Cloud / Enterprise (see [`roadmap.md`](roadmap.md)). |
