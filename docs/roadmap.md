# Tessera — Roadmap

> Direction, not a delivery commitment. Milestones map to PRD requirements
> ([`PRD.md`](PRD.md)); the harness (Phase B) turns each into tracked features built
> **one at a time** with verification gates. Dates are intentionally omitted until the
> harness and team velocity are established.

## Sequencing rationale

We deliberately build **Local MVP first** (ADR-0003): it forces the ports & adapters
discipline, proves the Context Compiler against a real local repo with zero external
dependencies, and gives a usable product to a single developer before any cloud
complexity. Each later milestone is **adapters + surface**, not a rewrite.

---

## R0 — Local MVP: "the engine"
**Goal:** a single developer gets compiled, effect-aware, **cited** context locally, with
zero external services or API keys.

- Ingestion: local code + Git + in-repo docs, event-driven, incremental, secret-redacted
  (FR-1/2/3/6/7/8/9).
- Memory: core types, metadata, versioning, manual capture (FR-10/11/12/13).
- Knowledge graph + **effect-links** from static analysis + manual assertion; `get_effects`
  (FR-16/17/18/19).
- Hybrid retrieval: semantic + keyword + graph + symbolic + fusion (FR-21/22/23/25/26).
- **Context Compiler**: full pipeline, provenance, budget, dedup, explainability
  (FR-27/28/29/30/32).
- Interfaces: MCP server + REST `/v1` + plugin SDK (FR-35/37/40).
- Dashboard: global search + **Package Inspector** + UX baseline (FR-41/44/49).
- Deployment: Local profile, SQLite + sqlite-vec + filesystem + Transformers.js
  (FR-50/53).

**Exit criteria:** `compile_context` beats naive top-k RAG on a labeled task suite
(Context Quality Score), p95 latency within NFR-4, effect recall measured.

## R1 — Team / Self-Hosted
**Goal:** a team shares project memory and runs Tessera on its own infra.

- Connectors: GitHub PRs/issues, chat/IDE activity; automatic memory extraction
  (FR-4/5/14).
- Retrieval/compiler: temporal retrieval, compression, reproducibility + caching, pluggable
  stage strategies (FR-24/31/33/34).
- Realtime + SDK: SSE/WebSocket, generated TS SDK (FR-38/39).
- Dashboard: KG/architecture viz, timeline, Monaco authoring, configuration UI
  (FR-42/43/45/46).
- Ops: Docker Compose stack (Postgres+pgvector+Redis+object store), backup/restore,
  migrations, plugin lifecycle (FR-51/56/59).
- Decide OQ2 (graph storage), OQ4 (license), front-end ADR.

## R2 — Managed Cloud
**Goal:** hosted, multi-tenant SaaS.

- Multi-tenancy + org isolation, RBAC (FR-52/54).
- MCP **gateway** (multi-client auth + quotas) (FR-36).
- Retention policies, analytics, feature flags, plugin permissions
  (FR-15/47/57/60).
- Cost/usage metering per tenant (NFR-12).

## R3 — Enterprise
**Goal:** adoption by regulated organizations.

- Governance/audit UI, full audit trail (FR-48/55).
- SSO, advanced RBAC, data residency, compliance posture (NFR-13).
- Backup/DR guarantees, dedicated/VPC deployment.

---

## Cross-cutting, every milestone
- Security, observability (OTel/Pino), accessibility (WCAG AA), tests (unit/integration/
  E2E), and ADRs for new decisions are **not** separate phases — they ship with each
  feature (engineering standards).

## Tracking
Once the harness lands (Phase B), this roadmap's requirements become entries in
`.harness/state/feature_list.json` with status, owner-service, acceptance criteria, and
verification — the machine-readable source of truth for "what's done."
