# Tessera — System Architecture

| Field | Value |
|-------|-------|
| **Status** | Draft v1.0 — Phase A |
| **Last updated** | 2026-06-27 |
| **Scope** | Engine, dashboard, SDK, MCP, plugins, deployment |
| **Authoritative decisions** | [`../adr/`](../adr) (ADRs are the source of truth for *why*) |

> This document describes **how** Tessera is built. The **why** lives in the ADRs; the
> **what/when** lives in [`../PRD.md`](../PRD.md). Where they disagree, the ADRs win and
> this doc is updated.

---

## 1. Architectural principles

1. **Compile, don't dump** — context is a *built artifact* with provenance, not a chunk
   pile ([ADR-0004](../adr/0004-context-compilation-over-naive-rag.md)).
2. **Ports & adapters** — the domain depends on interfaces; infrastructure is swappable;
   deployment is configuration ([ADR-0003](../adr/0003-local-first-cloud-ready-ports-and-adapters.md)).
3. **Modular monolith** — strong internal boundaries now, splittable to services later
   without rewrite ([ADR-0001](../adr/0001-architecture-modular-monolith-in-turborepo.md)).
4. **Local-first** — full capability with zero external services or keys; cloud is the
   same code with different adapters.
5. **Event-driven ingestion** — sources emit changes; async workers process idempotently.
6. **Everything explainable & observable** — provenance on data, OTel on execution.
7. **Plugin-extensible** — connectors, processors, AI providers, storage, and retrieval
   strategies are plugins behind stable contracts.

## 2. System context (C4 L1)

```
            ┌────────────────────────────────────────────────────────────┐
  Agents    │                          TESSERA                            │
 (Claude,   │                                                            │
  Cursor,   │   ┌──────────┐   ┌───────────────┐   ┌──────────────────┐   │
  Codex, …) ├──▶│ MCP / API │──▶│ Context Engine │──▶│ Storage (ports)  │   │
            │   └──────────┘   └───────────────┘   └──────────────────┘   │
  Humans    │        ▲                ▲                      ▲             │
 (devs,     ├────────┘                │                      │             │
  admins)   │   ┌──────────┐   ┌───────────────┐   ┌──────────────────┐   │
            │   │ Dashboard │   │  Ingestion     │◀──│  Sources         │   │
            │   │ (Next.js) │   │  (workers)     │   │ code/git/docs/   │   │
            │   └──────────┘   └───────────────┘   │ PRs/issues/chat   │   │
            └────────────────────────────────────────────────────────────┘
```

External actors: **agents** (primary consumers via MCP/REST), **humans** (dashboard),
and **sources** (ingested). Optional external services (hosted embeddings/LLM, OIDC,
object store) are adapter-selected and never required locally.

**Ecosystem position.** Tessera is the *context/memory layer* — **not** an agent
orchestrator or runtime. It sits alongside single agents and *beneath* **meta-harnesses**
(e.g. Databricks Omnigent) that compose, govern, and run agents: those layers call Tessera
over MCP/REST for compiled, provenance-tagged context. We therefore deliberately **do not**
build orchestration, sandboxing, or live agent-session infrastructure (PRD NG7) — our
investment is compilation, memory, the knowledge graph, and effect-links. The single MCP
surface serves an IDE agent, a CLI agent, or an orchestrator's worker identically.

## 3. Containers (C4 L2)

| Container | Package(s) | Runtime | Responsibility |
|-----------|-----------|---------|----------------|
| **API service** | `@tessera/api` (`apps/api`) | Fastify/Node | HTTP `/v1`, MCP endpoint, SSE/WS, auth, routing into domain. |
| **Ingestion workers** | `@tessera/ingestion` | in-process (local) / BullMQ workers (cloud) | Consume source events, run processors, write to stores. |
| **Dashboard** | `@tessera/web` (`apps/web`) | Next.js/React | Search, graph, timeline, package inspector, config, governance. |
| **Domain packages** | `@tessera/*` | library | Compiler, retrieval, KG, memory, storage ports — no I/O of their own. |
| **MCP server** | `@tessera/mcp` | embedded in API (gateway later) | Exposes tools to agents. |
| **SDK** | `@tessera/sdk` | library | Generated + hand-written client; plugin SDK. |

In **Local/Self-Hosted**, API + workers + MCP run in **one process** (workers can be a
thread/queue consumer). In **Cloud**, workers and (optionally) embeddings run as separate
deployments — same code, different process boundary.

## 4. Component model & package boundaries (C4 L3)

```
apps/
  api/                      @tessera/api        Fastify app: routes, plugins, MCP mount, SSE
  web/                      @tessera/web        Next.js dashboard
packages/
  core/                     @tessera/core       domain types, errors, config, event bus, ids
  ingestion/                @tessera/ingestion  source events → processors → stores
  knowledge-graph/          @tessera/knowledge-graph  KG model + effect-links + traversal
  retrieval/                @tessera/retrieval  semantic/keyword/graph/temporal/symbolic + fusion
  context-compiler/         @tessera/context-compiler  plan→…→assemble pipeline
  memory/                   @tessera/memory     memory types, versioning, retention
  storage/                  @tessera/storage    PORTS + adapters (sql, vector, blob, queue)
  ai/                       @tessera/ai         embeddings/LLM PORTS + adapters
  mcp/                      @tessera/mcp        MCP tools over the engine
  sdk/                      @tessera/sdk        client SDK + plugin SDK contracts
  config/                   @tessera/config     deployment profiles, schema, secrets port
  observability/            @tessera/observability  OTel + logging conventions
  plugin-host/              @tessera/plugin-host    discovery, lifecycle, sandbox, capabilities
```

**Boundary rules** (enforced by lint/`exports`, an early harness rule):
- Domain packages **must not** import adapters directly; they depend on **ports** in
  `@tessera/storage` / `@tessera/ai`.
- `@tessera/core` may be imported by anyone; it imports nothing else internal.
- `apps/*` compose packages; packages never import from `apps/*`.
- Cross-module calls go through published interfaces or the **domain event bus**.

## 5. Domain model (core entities)

```
Source ─< Document ─< Chunk            (raw + normalized content units)
Document ─< Symbol                     (code symbols: fn/class/type/var)
Node (kind: file|symbol|module|person|decision|memory) ─< Edge (typed)
Edge.kind ∈ { imports, calls, references, owns, supersedes, EFFECT_LINK, ... }
EffectLink = Edge(kind=EFFECT_LINK){ from, to, rationale, confidence, origin }
Memory (kind: decision|lesson|incident|failure|architecture|glossary|task)
        { body, metadata, version, supersedes?, scope, confidence }
Embedding { ownerRef, model, dim, vector }    (model+dim recorded per vector)
ContextPackage { task, budget, sections[], provenance[], trace, scores }
```

All entities carry stable ids, timestamps, and source provenance. Memories and
effect-links are **versioned and supersedable**, never silently mutated (PRD FR-12/FR-17).

## 6. Ports & adapters catalog

| Port (interface) | Package | Local adapter | Cloud/self-host adapter |
|------------------|---------|---------------|-------------------------|
| `RelationalStore` | `@tessera/storage` | SQLite (Drizzle) | Postgres (Drizzle) |
| `VectorStore` | `@tessera/storage` | sqlite-vec | pgvector |
| `BlobStore` | `@tessera/storage` | filesystem | S3-compatible |
| `Queue` | `@tessera/storage` | in-process | Redis + BullMQ |
| `Embeddings` | `@tessera/ai` | Transformers.js / Ollama | hosted provider (opt) |
| `LLM` | `@tessera/ai` | local (opt) | hosted provider |
| `SecretsProvider` | `@tessera/config` | env/file | KMS/vault |
| `AuthProvider` | `@tessera/api` | none/local | OIDC + RBAC |

Each port ships a **conformance test suite**; every adapter must pass it, guaranteeing
parity across deployments (ADR-0003 follow-up). Adapters expose **capability flags** for
features that legitimately differ (e.g. SQL dialect specifics).

## 7. Ingestion pipeline (event-driven)

```
Source(plugin) ──emit──▶ ChangeEvent ──▶ Queue ──▶ Worker
                                                     │
   ┌─────────────────────────────────────────────────┘
   ▼
 normalize → chunk → extract(symbols, memories) → redact(secrets)
   → embed (Embeddings port) → upsert(Relational + Vector + Blob)
   → graph-update (nodes/edges/effect-links) → emit IngestedEvent (SSE)
```

Properties: **incremental** (content-hash diffing; only changed units reprocessed —
FR-8), **idempotent & retryable**, **redaction before persist** (FR-9), and
**pluggable processors** (FR-7). Static analysis during `extract`/`graph-update` derives
**effect-link candidates** from the import/call graph (FR-18).

## 8. Hybrid retrieval subsystem

Five retrievers behind a common `Retriever` interface, combined by a **fusion ranker**:

| Retriever | Signal | Backend |
|-----------|--------|---------|
| Semantic | embedding similarity | VectorStore (sqlite-vec/pgvector) |
| Keyword | BM25/FTS | RelationalStore FTS |
| Graph | KG + effect-link traversal | knowledge-graph |
| Temporal | recency / time-window | RelationalStore (timestamps) |
| Symbolic | exact symbol/def lookup | symbol index |

Fusion uses configurable weights (reciprocal-rank-fusion style) → a single ranked
candidate set with per-candidate signal attribution (feeds compiler explainability).

## 9. Context Compiler (the core)

A pipeline of **stages**, each a swappable strategy behind a stable interface
([ADR-0004](../adr/0004-context-compilation-over-naive-rag.md)):

```
compile_context(task, budget, filters)
  │
  ├─ plan      → needs[], per-need budget allocation
  ├─ retrieve  → hybrid retrieval per need  (§8)
  ├─ expand    → follow KG + EFFECT_LINKs to pull dependents
  ├─ rank      → relevance × recency × authority × task-fit
  ├─ dedup     → collapse near-duplicates (embedding + shingle)
  ├─ compress  → budget-aware summarize, preserve citations
  └─ assemble  → ordered, sectioned ContextPackage + provenance + trace
```

Every stage writes to a **compilation trace** (inputs, candidates, scores, drops) that the
dashboard's **Package Inspector** (FR-44) renders. Packages are **reproducible** (same
inputs → same output) and **cacheable** with incremental recompute (FR-33).

## 10. Knowledge graph & effect-links

- Stored relationally for R0 (nodes/edges tables; traversal via **recursive CTEs** over
  Drizzle), keeping the local zero-dependency promise. A dedicated graph engine is an
  open question for R1+ (PRD OQ2).
- **Effect-links** are typed edges with `rationale`, `confidence`, and `origin`
  (`static` | `manual` | `learned`). `get_effects(symbol)` runs a ranked traversal and
  returns affected files/symbols with paths and explanations (FR-17/19).
- The **effect-link protocol** in the harness (Phase B) requires an agent to consult and
  update effect-links when editing a symbol — the product practices what it preaches.

## 11. API, MCP & realtime surface

- **REST `/v1`** — OpenAPI-described, additive-versioned (NFR-11). Validation via Zod at
  the boundary; serialization via Fastify JSON Schema.
- **MCP** — tools `search`, `compile_context`, `get_effects`, `capture_memory`,
  `explain` (FR-35); embedded in the API process now, **gateway** (multi-client auth +
  quotas) in R2 (FR-36).
- **SSE/WebSocket** — ingest progress, new memories, package-ready events (FR-38).
- **SDKs** — TS SDK generated from OpenAPI + hand-written ergonomics (FR-39); **plugin
  SDK** contracts in `@tessera/sdk` (FR-40).

## 12. Plugin architecture

`@tessera/plugin-host` provides discovery, **config schema validation**, lifecycle
(init/health/shutdown), **failure isolation**, and **capability + permission
declarations** (least privilege). Extension points: `Connector`, `Processor`,
`AIProvider`, `StorageBackend`, `RetrievalStrategy`, `CompilerStage`. Core ships
first-party plugins (e.g. local-FS connector, git connector, Transformers.js embeddings)
using the *same* contracts third parties use.

## 13. Deployment topology

```
LOCAL (one process, zero external deps)
  apps/api ── in-proc workers ── SQLite(+sqlite-vec) ── filesystem ── Transformers.js
  apps/web (optional) ── talks to apps/api

SELF-HOSTED (docker compose)
  api ─┬─ Postgres(+pgvector)
       ├─ Redis ── BullMQ workers
       ├─ object store (S3-compatible)
       └─ web
  OIDC provider (external)         optional: Ollama / hosted embeddings

MANAGED CLOUD
  load-balanced api (stateless, N replicas)
  worker pool (autoscaled)         multi-tenant Postgres(+pgvector), per-tenant isolation
  object store (S3)                OIDC + org RBAC, audit, retention
```

The transition between modes is a **deployment profile** + adapter wiring — no domain code
changes (ADR-0003). Remote access for self-host is a documented `cloudflared`/reverse-proxy
recipe, not a product feature (ADR-0007).

## 14. Security model

- **Boundaries:** Zod validation on every external input; output serialization via schema.
- **Secrets:** `SecretsProvider` port; secrets never logged or persisted; secret-scrubbing
  on ingest (FR-9). `.env*` and `settings.local.json` git-ignored.
- **Transport/at-rest:** TLS in transit; at-rest encryption for cloud stores.
- **AuthN/Z:** OIDC (hosted) + scoped, revocable API tokens; **org RBAC** (R2); plugin
  least-privilege (R2).
- **Tenancy:** row/schema-level isolation per tenant in cloud; no cross-tenant retrieval.
- **Audit & retention:** audit log for sensitive actions (R3); per-type retention (R2);
  data export/delete for DSR (NFR-13).
- **Supply chain:** dependency + secret scanning in CI; pinned versions; SBOM later.

## 15. Observability

- **OpenTelemetry** traces across API → compiler stages → adapters; metrics (latency,
  cache hit, queue depth, retrieval quality); **Pino** structured logs with correlation
  ids.
- **Compilation trace** is a first-class artifact (debuggable in the dashboard), distinct
  from infra telemetry.
- Health/readiness endpoints (NFR-6); RED/USE dashboards in cloud.

## 16. Configuration & cross-cutting

- `@tessera/config` loads a **deployment profile** (validated schema) selecting adapters,
  providers, budgets, quotas, and feature flags. One config surface; environment overrides;
  secrets via the secrets port.
- Cross-cutting concerns (auth, tenancy, tracing, rate-limit) are Fastify plugins applied
  uniformly, not sprinkled per-route.

## 17. Technology stack (summary)

| Layer | Choice | ADR |
|------|--------|-----|
| Repo/build | Turborepo + pnpm | [0001](../adr/0001-architecture-modular-monolith-in-turborepo.md) |
| Backend | Node 22 LTS + Fastify + TS (strict) | [0002](../adr/0002-backend-framework-fastify.md) |
| Validation/contracts | Zod + JSON Schema → OpenAPI | [0002](../adr/0002-backend-framework-fastify.md) |
| Data layer | Drizzle ORM (+ raw SQL for vector/graph) | [0005](../adr/0005-orm-drizzle.md) |
| Relational | SQLite → Postgres | [0003](../adr/0003-local-first-cloud-ready-ports-and-adapters.md) |
| Vector | sqlite-vec → pgvector | [0006](../adr/0006-embeddings-and-vector-store.md) |
| Embeddings | Transformers.js / Ollama (hosted opt) | [0006](../adr/0006-embeddings-and-vector-store.md) |
| Queue/jobs | in-process → Redis + BullMQ | [0003](../adr/0003-local-first-cloud-ready-ports-and-adapters.md) |
| Frontend | Next.js + React + Tailwind + shadcn/ui | — (frontend ADR in R1) |
| Realtime | SSE / WebSocket | — |
| Observability | OpenTelemetry + Pino | — |
| Packaging | Docker / Docker Compose | [0003](../adr/0003-local-first-cloud-ready-ports-and-adapters.md) |

## 18. Open architecture questions

- **OQ2** (graph storage), **OQ3** (compression strategy), **OQ5** (symbol extraction:
  tree-sitter vs LSP) — see [`../PRD.md#12-open-questions`](../PRD.md#12-open-questions).
  Each will be resolved by an ADR before the code that depends on it is written.
