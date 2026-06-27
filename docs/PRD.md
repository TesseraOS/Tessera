# Tessera — Product Requirements Document (PRD)

| Field | Value |
|-------|-------|
| **Product** | Tessera — Context & Memory Operating System for AI coding agents |
| **Codename** | ContextOS (internal only) |
| **Package scope** | `@tessera/*` |
| **Status** | Draft v1.0 — Phase A (definition) |
| **Last updated** | 2026-06-27 |
| **Owner** | Project lead |
| **Related** | [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md), [`adr/`](adr), [`roadmap.md`](roadmap.md), [`glossary.md`](glossary.md) |

> **How to read this PRD.** Requirements are numbered (`FR-*` functional, `NFR-*`
> non-functional) so they trace directly into the harness `feature_list.json` (Phase B)
> and into tests. Priorities use **MoSCoW** (Must / Should / Could / Won't-yet) and are
> tagged with the **release** that first delivers them (see [§11](#11-milestones--phasing)).

---

## 1. Executive summary

AI coding agents are bottlenecked less by model capability than by the **quality of
context** they are given. Today that context is assembled by naive retrieval — embed
everything, grab the top-k nearest chunks, paste them in — which is noisy, redundant,
provenance-free, and blind to structure and consequences. Agents hallucinate APIs that
don't exist, miss the decision that explains why the code is the way it is, and "fix one
file while breaking three others."

**Tessera** is a deployment-agnostic platform that **captures** project knowledge from
code, Git, docs, PRs, issues, chats, and IDE activity, organizes it into **memory + a
knowledge graph + effect-links**, and **compiles task-aware context packages** on demand
via a transparent, provenance-tracked pipeline. It exposes identical **HTTP API + MCP**
interfaces to any agent (Claude, Cursor, Codex, Cline, Roo, Continue, …) and ships a
**Next.js dashboard** for search, graphs, timelines, configuration, governance, and
debugging. The same codebase runs **Local, Self-Hosted, Managed Cloud, and Enterprise**
— deployment is configuration, not a fork.

## 2. Problem statement

1. **Context is low-signal.** Top-k vector RAG returns near-duplicates and irrelevant
   chunks, wasting the token budget and degrading agent output.
2. **No provenance or explainability.** When an agent gets context, neither the agent
   nor the human knows *why* a fragment was included or whether it's current.
3. **Structure is ignored.** Call graphs, ownership, module boundaries, and especially
   **the downstream effects of a change** are invisible to plain retrieval.
4. **Memory is ephemeral and siloed.** Decisions, lessons, incidents, and rationale live
   in people's heads, scattered chats, and closed PRs — not in a queryable store.
5. **Every tool reinvents this badly.** Each IDE/agent builds its own shallow context
   layer; nothing is shared, governed, or auditable across tools and teammates.
6. **Enterprises can't adopt black boxes.** Without RBAC, audit, retention, encryption,
   and on-prem/local options, this never reaches regulated organizations.

## 3. Goals & non-goals

### 3.1 Goals
- **G1 — Compile, don't dump.** Produce task-specific, ranked, deduplicated, compressed,
  **provenance-tagged** context packages, not chunk piles. _(see [ADR-0004](adr/0004-context-compilation-over-naive-rag.md))_
- **G2 — Capture automatically.** Continuously ingest from code/Git/docs/PRs/issues/
  chats/IDE with minimal manual curation.
- **G3 — Model consequences.** Make **effect-links** first-class so agents see what a
  change will break.
- **G4 — Be agent-agnostic.** First-class **MCP** + REST so any agent/tool integrates.
- **G5 — One platform, four deployments.** Local → Self-Hosted → Cloud → Enterprise with
  identical APIs. _(see [ADR-0003](adr/0003-local-first-cloud-ready-ports-and-adapters.md))_
- **G6 — Enterprise-grade by default.** Security, RBAC, audit, observability, and
  governance designed in, not bolted on.
- **G7 — Explainable & debuggable.** Every package, score, and decision inspectable from
  the dashboard.

### 3.2 Non-goals (now)
- **NG1** — We are **not** building a foundation model or an embedding model.
- **NG2** — We are **not** building an IDE or an agent; we serve them.
- **NG3** — We are **not** building tunneling/ingress (documented recipe only —
  [ADR-0007](adr/0007-cloudflare-tunnel-documented-not-built.md)).
- **NG4** — No general-purpose note-taking / PKM for non-engineering use in v1.
- **NG5** — No fine-tuning pipeline in v1 (memory informs prompts, not weights).

## 4. Personas & primary use cases

| Persona | Description | Top jobs-to-be-done |
|--------|-------------|---------------------|
| **The Agent** (primary consumer) | An AI coding agent via MCP/REST | "Give me exactly the context to do *this* task, with sources." / "What breaks if I change `X`?" |
| **Individual developer** | Solo dev running Local mode | "Remember my project so my agent stops repeating mistakes." / "Search across code+docs+decisions." |
| **Team developer** | Member of a team on Self-Hosted/Cloud | "Share project memory and decisions with teammates and our agents." |
| **Platform / DevEx admin** | Owns the Tessera deployment | "Configure connectors, providers, quotas." / "Govern access, retention, and audit." |
| **Security / compliance officer** | Enterprise gatekeeper | "Prove who accessed what, where data lives, and how it's retained/encrypted." |

**Signature use cases**
- **UC1 — Task context on demand:** an agent calls `compile_context(task)` and receives a
  ranked, cited package within budget.
- **UC2 — Effect-aware editing:** before/while editing `A`, the agent is told `B`, `C`
  must change too, with the links explained.
- **UC3 — Decision recall:** "Why do we use Fastify?" returns the ADR + surrounding
  discussion, not a guess.
- **UC4 — Onboarding:** a new dev (or fresh agent session) asks for an architecture brief
  and gets a compiled, sourced overview.
- **UC5 — Incident memory:** a past outage's root cause + fix are retrievable when similar
  code is touched again.

## 5. Differentiators (what makes Tessera, Tessera)

1. **The Context Compiler** — an explicit `plan → retrieve → expand → rank → dedup →
   compress → assemble` pipeline producing explainable packages. Naive RAG is *one
   retrieval strategy inside* it, not the whole product.
2. **Effect-links** — a maintained graph of "change here ⇒ change there," surfaced to
   agents and humans, so edits don't silently break dependents.
3. **Deployment-agnostic, local-first** — full capability with **zero external services
   or API keys** locally, scaling to multi-tenant cloud with the same code.
4. **Explainability & governance as features** — provenance on every fragment; RBAC,
   audit, and retention as product surface, not afterthoughts.

---

## 6. Functional requirements

> Priority key: **M**ust / **S**hould / **C**ould / **W** = not-yet. Release = first
> milestone that delivers it (R0 = MVP/local; R1 = team/self-host; R2 = cloud; R3 =
> enterprise — see [§11](#11-milestones--phasing)).

### 6.1 Ingestion & capture
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-1 | Ingest a local codebase (files, languages, structure) incrementally. | M | R0 |
| FR-2 | Ingest Git history (commits, diffs, blame, authorship, branches, tags). | M | R0 |
| FR-3 | Ingest docs/markdown/ADRs in-repo. | M | R0 |
| FR-4 | Ingest PRs/issues from providers (GitHub first) via connectors. | S | R1 |
| FR-5 | Ingest chat/transcripts and IDE/agent activity via SDK/MCP. | S | R1 |
| FR-6 | **Event-driven** pipeline: change → enqueue → async workers process. | M | R0 |
| FR-7 | Connectors are **plugins** with a stable SDK; new sources add without core changes. | M | R0 |
| FR-8 | Incremental & idempotent processing (no full re-index on small changes). | M | R0 |
| FR-9 | Redaction/secret-scrubbing on ingest (never store detected secrets). | M | R0 |

### 6.2 Memory system
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-10 | First-class **memory types**: decision/ADR, lesson, incident, failure, architecture fact, glossary term, task note. | M | R0 |
| FR-11 | Memories carry metadata: source, author, timestamps, confidence, links, scope. | M | R0 |
| FR-12 | Memories are **versioned** (point-in-time; supersedable, never silently mutated). | M | R0 |
| FR-13 | Manual capture/edit of memories (UI + API + MCP). | M | R0 |
| FR-14 | Automatic memory extraction from ingested sources (e.g. ADRs, commit messages). | S | R1 |
| FR-15 | Retention & expiry policies per memory type / scope. | S | R2 |

### 6.3 Knowledge graph & effect-links
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-16 | Build a **project knowledge graph**: symbols, files, modules, people, decisions, and their relations. | M | R0 |
| FR-17 | **Effect-links**: typed edges "change A ⇒ must-review/change B" with rationale + confidence. | M | R0 |
| FR-18 | Effect-links derivable from static analysis (call/import graph) **and** assertable manually. | M | R0 |
| FR-19 | Query: "what is affected if I change `X`?" returns ranked dependents with paths. | M | R0 |
| FR-20 | Graph + temporal queries (e.g. "what changed near this symbol last sprint"). | S | R1 |

### 6.4 Hybrid retrieval
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-21 | **Semantic** retrieval via embeddings (local-default). _([ADR-0006](adr/0006-embeddings-and-vector-store.md))_ | M | R0 |
| FR-22 | **Keyword/lexical** retrieval (BM25/FTS). | M | R0 |
| FR-23 | **Graph** retrieval (traverse KG + effect-links). | M | R0 |
| FR-24 | **Temporal** retrieval (recency/time-window weighting). | S | R1 |
| FR-25 | **Symbolic** retrieval (exact symbol/definition lookup). | M | R0 |
| FR-26 | **Fusion/ranker** combines signals into a single ranked set (configurable weights). | M | R0 |

### 6.5 Context Compiler
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-27 | `compile_context(task, budget, filters)` runs plan→retrieve→expand→rank→dedup→compress→assemble. | M | R0 |
| FR-28 | Output is a **Context Package**: ordered sections, each fragment **provenance-tagged**. | M | R0 |
| FR-29 | **Token-budget aware**: never exceed a requested budget; degrade gracefully. | M | R0 |
| FR-30 | **Deduplication** of near-identical fragments. | M | R0 |
| FR-31 | **Compression/summarization** preserving citations. | S | R1 |
| FR-32 | **Explainability**: per-fragment "why included" (signals, scores) retrievable. | M | R0 |
| FR-33 | **Reproducible & cacheable**: same inputs → same package; cache + incremental recompute. | S | R1 |
| FR-34 | Pluggable strategy per stage (swap ranker/compressor without API change). | S | R1 |

### 6.6 Interfaces — MCP, API, SDK
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-35 | **MCP server** exposing tools: `search`, `compile_context`, `get_effects`, `capture_memory`, `explain`. | M | R0 |
| FR-36 | **MCP gateway** brokering multiple agents/clients with auth + quotas. | S | R2 |
| FR-37 | **REST API** (OpenAPI-described, versioned `/v1`) covering all capabilities. | M | R0 |
| FR-38 | **SSE/WebSocket** for live updates (ingest progress, new memories). | S | R1 |
| FR-39 | **Generated client SDK(s)** from OpenAPI; first-class TS SDK. | S | R1 |
| FR-40 | **Plugin SDK** for connectors, processors, AI providers, storage backends. | M | R0 |

### 6.7 Dashboard (Next.js)
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-41 | Global search across code/memory/graph with result provenance. | M | R0 |
| FR-42 | Knowledge-graph & architecture visualization (React Flow). | S | R1 |
| FR-43 | Timeline of changes/decisions/incidents. | S | R1 |
| FR-44 | **Context Package inspector** (the "why" debugger): stages, scores, sources. | M | R0 |
| FR-45 | Memory/ADR authoring & editing (Monaco). | S | R1 |
| FR-46 | Configuration UI: connectors, providers, deployment profile, quotas. | S | R1 |
| FR-47 | Analytics: retrieval quality, usage, cost, latency. | C | R2 |
| FR-48 | Governance UI: users, roles, audit log, retention. | S | R3 |
| FR-49 | UX baseline: command palette (⌘K), themes, skeleton/empty/error states, toasts, optimistic updates, virtualized lists, WCAG AA. | M | R0→ |

### 6.8 Deployment, multi-tenancy & collaboration
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-50 | Single binary/process **Local** mode: SQLite + sqlite-vec + filesystem, no external deps. | M | R0 |
| FR-51 | **Self-Hosted** mode: Postgres + pgvector + object store + Redis/BullMQ via Docker Compose. | M | R1 |
| FR-52 | **Managed Cloud** mode: multi-tenant, org/workspace isolation. | S | R2 |
| FR-53 | **Deployment profiles** select adapters by config; no code change between modes. | M | R0 |
| FR-54 | Multi-user collaboration with **RBAC** (roles, scoped permissions). | S | R2 |
| FR-55 | **Audit logs** for sensitive actions (access, config, exports). | S | R3 |
| FR-56 | Backup & restore; migration system for schema/data. | M | R1 |
| FR-57 | Feature flags for progressive rollout. | C | R2 |

### 6.9 Plugin ecosystem
| ID | Requirement | Pri | Rel |
|----|-------------|-----|-----|
| FR-58 | Stable plugin contracts for: connectors, processors, AI providers, storage, retrieval strategies. | M | R0 |
| FR-59 | Plugin lifecycle: discovery, config schema, health, sandboxed failure isolation. | S | R1 |
| FR-60 | Plugin capability + permission declarations (least privilege). | S | R2 |

---

## 7. Non-functional requirements

| ID | Area | Requirement |
|----|------|-------------|
| NFR-1 | **Security** | Input validation at every boundary (Zod); secrets never logged/stored; encryption in transit; encryption at rest for cloud; dependency & secret scanning in CI. |
| NFR-2 | **AuthZ/AuthN** | OIDC for hosted modes; org RBAC; least-privilege plugins; API keys/tokens scoped & revocable. |
| NFR-3 | **Privacy/data residency** | Local mode never makes network calls unless explicitly enabled; cloud supports region/residency and per-tenant isolation. |
| NFR-4 | **Performance** | Targets (to be benchmarked): `search` p95 < 300 ms local; `compile_context` p95 < 2 s for a typical task at default budget; ingestion keeps up with incremental edits in near-real-time. |
| NFR-5 | **Scalability** | Stateless API horizontally scalable; ingestion/embeddings extractable to workers; storage scales SQLite→Postgres without domain change. |
| NFR-6 | **Reliability** | Idempotent, retryable jobs; graceful degradation (e.g. compiler returns best-effort within budget); health/readiness endpoints. |
| NFR-7 | **Observability** | OpenTelemetry traces/metrics/logs; structured logging (Pino); every compile is traceable end-to-end. |
| NFR-8 | **Maintainability** | Modular boundaries enforced; ports & adapters; ADRs for decisions; comprehensive tests (unit/integration/E2E). |
| NFR-9 | **Accessibility** | Dashboard meets **WCAG 2.1 AA**; full keyboard operability. |
| NFR-10 | **Portability** | Runs on Windows/macOS/Linux; Node 22 LTS; containerizable. |
| NFR-11 | **API stability** | Versioned API; additive change policy; deprecation windows. |
| NFR-12 | **Cost control** | Local-default avoids API spend; cloud tracks per-tenant usage/cost; embedding/LLM calls batched & cached. |
| NFR-13 | **Compliance-readiness** | Audit trail, retention, data export/delete (DSR), configurable encryption — designed to support SOC2/GDPR posture. |
| NFR-14 | **i18n-readiness** | UI strings externalized; not necessarily translated in v1. |

---

## 8. Deployment modes (one architecture)

| Capability | Local | Self-Hosted | Managed Cloud | Enterprise |
|-----------|:-----:|:-----------:|:-------------:|:----------:|
| Relational store | SQLite | Postgres | Postgres (multi-tenant) | dedicated/VPC |
| Vector store | sqlite-vec | pgvector | pgvector | pgvector/dedicated |
| Object store | filesystem | S3-compatible | S3 | S3/VPC |
| Queue | in-process | Redis+BullMQ | Redis+BullMQ | Redis+BullMQ |
| Embeddings | Transformers.js/Ollama | local or hosted | hosted/local | per-policy |
| Auth | none/local | OIDC | OIDC + org RBAC | SSO + RBAC |
| Audit/retention | basic | yes | yes | full + policies |
| Intended user | individual | team | SaaS | regulated org |

Selected by a **deployment profile** ([ADR-0003](adr/0003-local-first-cloud-ready-ports-and-adapters.md)); same codebase throughout.

## 9. Success metrics

- **North star:** **Context Quality Score** per package = f(relevance, low-redundancy,
  budget-adherence, provenance-coverage), validated against a labeled eval set.
- **Agent outcome:** measurable reduction in agent errors / re-tries when using a Tessera
  package vs naive RAG on a fixed task suite.
- **Effect recall:** % of true downstream-affected files surfaced by `get_effects`
  (precision/recall on a labeled set).
- **Latency:** meets NFR-4 p95 targets.
- **Adoption (hosted):** WAU, packages compiled/day, connectors configured, retention.
- **Trust:** % of packages a user inspects and accepts without manual edits.

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Compiler complexity slows delivery | High | Ship simplest strategy per stage behind stable interfaces; iterate per stage. |
| Local JS embeddings too slow on big repos | Med | Batching, caching, incremental embed; optional Ollama/hosted adapters. |
| Effect-links noisy/low-precision | High | Start from static analysis (high precision), allow manual assertions, score confidence, measure recall. |
| Adapter drift (SQLite vs Postgres) | Med | Conformance test suite run against every adapter. |
| Scope sprawl (huge feature surface) | High | Harness enforces one-feature-at-a-time; MoSCoW + release gating in this PRD. |
| Brand/domain/trademark | Low | [ADR-0008](adr/0008-brand-tessera-and-package-scope.md): verify domain + TM before launch; fallback name ready. |
| Enterprise trust (data handling) | High | Local-first option, encryption, audit, RBAC, retention designed in from R0/R3. |

## 11. Milestones & phasing

> The harness will turn each milestone's `FR-*` into tracked features built **one at a
> time**. This is direction, not a delivery commitment.

- **R0 — Local MVP ("the engine"):** FR-1/2/3/6/7/8/9, FR-10–13, FR-16–19, FR-21/22/23/
  25/26, FR-27/28/29/30/32, FR-35, FR-37, FR-40, FR-41/44/49, FR-50/53. Outcome: a single
  developer gets compiled, effect-aware, cited context locally with zero external services.
- **R1 — Team / Self-Hosted:** connectors (FR-4/5/14), temporal (FR-24), compression
  (FR-31), reproducibility/caching (FR-33/34), live updates (FR-38), SDK (FR-39), more
  dashboard (FR-42/43/45/46), Docker stack + backup/migrations (FR-51/56), plugin lifecycle
  (FR-59).
- **R2 — Managed Cloud:** multi-tenancy (FR-52/54), MCP gateway (FR-36), retention
  (FR-15), analytics (FR-47), feature flags (FR-57), plugin permissions (FR-60).
- **R3 — Enterprise:** governance/audit UI (FR-48/55), full RBAC/SSO, compliance posture
  (NFR-13), data residency.

## 12. Open questions

- **OQ1** — Default embedding model: benchmark `bge-small` vs `gte-small` vs `all-MiniLM`
  for code+docs before R0 freeze ([ADR-0006](adr/0006-embeddings-and-vector-store.md)).
- **OQ2** — Graph storage: stay relational (recursive CTEs over Drizzle) for R0, or adopt
  a dedicated graph engine later? Decide by R1 based on query needs.
- **OQ3** — Compression strategy: extractive vs LLM-abstractive (and which provider) under
  local-first constraints.
- **OQ4** — License model (OSS core + commercial? source-available?) — pre-R1.
- **OQ5** — Code-symbol extraction approach across languages (tree-sitter vs LSP) for FR-16.

## 13. References

- ADRs: [0001](adr/0001-architecture-modular-monolith-in-turborepo.md) ·
  [0002](adr/0002-backend-framework-fastify.md) ·
  [0003](adr/0003-local-first-cloud-ready-ports-and-adapters.md) ·
  [0004](adr/0004-context-compilation-over-naive-rag.md) ·
  [0005](adr/0005-orm-drizzle.md) · [0006](adr/0006-embeddings-and-vector-store.md) ·
  [0007](adr/0007-cloudflare-tunnel-documented-not-built.md) ·
  [0008](adr/0008-brand-tessera-and-package-scope.md)
- [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) ·
  [`roadmap.md`](roadmap.md) · [`glossary.md`](glossary.md)
