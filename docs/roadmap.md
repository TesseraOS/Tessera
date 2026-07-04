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

## R3 — Enterprise & product completeness
**Goal:** the shipped runtime does everything the packages can do; the dashboard is a
complete, authenticated product; an enterprise can trust it. *(Rescoped 2026-07-04 —
launch-readiness review.)*

- Governance/audit UI, full audit trail (FR-48/55) — **done** (F-027).
- **Close the core loop in the running product** (the #1 gap found in review): runtime
  source management via REST/MCP/UI + SSE progress (FR-62, F-038); live corpus indexing
  into fragments + all retrieval indices (FR-63, F-039); code-symbol extraction
  populating the knowledge graph + static effect-links, manual effect assertion via
  API/MCP — resolves OQ5 (FR-16/18/63, F-040).
- Dashboard completion: sources & settings UI (FR-46, F-041), memory browser + Monaco
  authoring + timeline (FR-45/43, F-042), knowledge-graph & effects visualization
  (FR-42, F-043).
- **Dashboard authentication + account**: sign-in/session + SDK adoption (FR-64, F-045),
  profile page + API-token self-service + user management (FR-65/48, F-046).
- **API hardening** (NFR-1): rate limiting, security headers, SSE auth, per-profile
  CORS, request-id propagation (F-044).
- Compliance completion (NFR-13): memory retention policies (FR-15), DSR export/delete,
  MCP-surface audit (F-047).
- **Full-stack E2E** mimicking a real user + environment (NFR-16, F-048) and the
  **performance benchmark suite** enforcing NFR-4 (+ web-perf activation) (F-049).

## R4 — Launch
**Goal:** public, professional, agent-first product: marketing on the apex domain,
dashboard on `app.`, docs on `docs.`, one-command agent onboarding. *(Added 2026-07-04;
ADR-0035/0036/0037.)*

- **Multi-project workspaces** per tenant (FR-66, F-050; ADR-0037).
- **Marketing site** on the apex domain (FR-67, F-051) and **docs site** on `docs.`
  with quickstart/concepts/API reference/agent guides + **self-host & cloud deployment
  guides** (FR-68, F-052).
- **Skills registry** + `/skills` page — first-party agent skills, installable via
  download/CLI/MCP (FR-69, F-053).
- **Agent-first distribution**: `@tessera/cli` one-command onboarding + agent config
  emit + `llms.txt` (FR-70, F-054); remote MCP over HTTP through the gateway (FR-71,
  F-055).
- Self-hosted profile completion (Postgres memory/graph, S3, BullMQ) + Dockerfiles,
  full compose stack, release CD publishing images (FR-51/53, NFR-15, F-056).
- Analytics & usage metering + billing UI + persistent subscriptions (FR-47, NFR-12,
  F-057); feature flags + plugin permissions/health (FR-57/59/60, F-058).
- **Launch readiness**: license (open-core), SBOM/supply-chain (NFR-18), release
  process, README/repo polish, brand/domain checklist (F-059).

---

## Cross-cutting, every milestone
- Security, observability (OTel/Pino), accessibility (WCAG AA), tests (unit/integration/
  E2E), and ADRs for new decisions are **not** separate phases — they ship with each
  feature (engineering standards).

## Tracking
Once the harness lands (Phase B), this roadmap's requirements become entries in
`.harness/state/feature_list.json` with status, owner-service, acceptance criteria, and
verification — the machine-readable source of truth for "what's done."
