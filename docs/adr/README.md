# Architecture Decision Records

This directory records the **significant, hard-to-reverse decisions** behind Tessera
and the reasoning that produced them. ADRs are append-only: we don't rewrite history,
we supersede it. To change an accepted decision, write a new ADR that sets the old
one's status to `Superseded by ADR-XXXX`.

Format: a lightweight [MADR](https://adr.github.io/madr/)-style template
([`0000-template.md`](0000-template.md)). One decision per file.

> **Governance:** Per the project's engineering standards, any deviation from a
> documented default requires a new ADR. The agent harness (Phase B) enforces this
> via the `write-adr` skill and the ADR governance policy.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-architecture-modular-monolith-in-turborepo.md) | Modular monolith in a Turborepo + pnpm monorepo | Accepted |
| [0002](0002-backend-framework-fastify.md) | Backend framework: Fastify on Node.js LTS + TypeScript | Accepted |
| [0003](0003-local-first-cloud-ready-ports-and-adapters.md) | Local-first, cloud-ready via ports & adapters | Accepted |
| [0004](0004-context-compilation-over-naive-rag.md) | Context compilation over naive RAG | Accepted |
| [0005](0005-orm-drizzle.md) | ORM / query layer: Drizzle | Accepted |
| [0006](0006-embeddings-and-vector-store.md) | Embeddings runtime & vector store | Accepted |
| [0007](0007-cloudflare-tunnel-documented-not-built.md) | Cloudflare Tunnel: documented, not built | Accepted |
| [0008](0008-brand-tessera-and-package-scope.md) | Brand "Tessera" & `@tessera/*` package scope | Accepted |
| [0009](0009-frontend-stack-and-design-system.md) | Frontend stack & design system (responsive, not PWA) | Accepted |
| [0010](0010-ci-cd-github-actions.md) | CI/CD via GitHub Actions | Accepted |
| [0011](0011-billing-dodo-payments.md) | Billing via Dodo Payments (Managed Cloud, R2) | Accepted (direction) |
| 0012 | _retired — agy/Gemini worker (removed; see git history)_ | Retired |
| [0013](0013-general-purpose-execution-skills-from-ecc.md) | General-purpose execution skills (adapted from ECC, MIT) | Accepted |
| [0014](0014-test-organization-hybrid.md) | Test organization — co-located unit, separate integration/e2e | Accepted |
| [0015](0015-ingestion-connector-contracts-and-git-cli.md) | Ingestion connector/processor contracts & Git via the `git` CLI | Accepted |
| [0016](0016-rest-api-fastify-zod-bridge.md) | REST API — Fastify + fastify-type-provider-zod (Zod-v4 bridge), injected services, e2e gate | Accepted |
| [0017](0017-mcp-server-surface.md) | MCP server surface — same services as REST, stdio transport, results without outputSchema | Accepted |
| [0018](0018-config-loader-and-local-profile.md) | Config loader & Local profile — composition root, secrets port, blob-backed corpus | Accepted |
| [0019](0019-observability-baseline.md) | Observability baseline — OTel API in libraries, SDK at the process, additive instrumentation | Accepted |
| [0020](0020-plugin-sdk-and-host.md) | Plugin SDK & host — uniform envelope over existing ports, isolated lifecycle, first-party dogfooding | Accepted |
| [0021](0021-frontend-harness-and-design-skill-adaptation.md) | Frontend execution harness, design-skill adaptation & Astryx evaluation (keep shadcn) | Accepted |
| [0022](0022-interim-dashboard-data-client.md) | Interim dashboard data client until the generated SDK (F-022) | Accepted |
| [0023](0023-adopt-efferd-dashboard-3-design-reference.md) | Adopt efferd Dashboard 3 as the binding dashboard design reference (dark-first, shadcn) | Accepted |
| [0024](0024-github-connector-and-auto-memory-extraction.md) | GitHub connector via REST `fetch` (no Octokit) + heuristic auto-memory extraction (structural memory seam) | Accepted |
| [0025](0025-generated-typescript-sdk-toolchain.md) | Generated TypeScript SDK — openapi-typescript types + openapi-fetch client | Accepted |
| [0026](0026-postgres-pgvector-adapters.md) | Postgres + pgvector storage adapters (self-hosted/cloud) + Docker Compose | Accepted |
| [0027](0027-backup-restore-and-migration-runner.md) | Backup/restore + a versioned migration runner | Accepted |
| [0028](0028-api-auth-tenancy-rbac.md) | API auth — AuthProvider port, tenancy + RBAC model, scoped tokens (OIDC + row-isolation as seams) | Accepted |
| [0029](0029-mcp-gateway-auth-quotas.md) | MCP gateway — reuse the auth model (type-only), per-principal quotas, shared RATE_LIMITED code | Accepted |
| [0030](0030-auth-composition-root-wiring.md) | Auth composition-root wiring — Fastify-free `@tessera/api/auth` subpath + persistent SQLite token store | Accepted |
| [0031](0031-billing-port-and-open-core.md) | Billing port + adapters (open-core) — `@tessera/billing`, local/free + Dodo | Accepted |
| [0032](0032-oidc-auth-provider.md) | OIDC AuthProvider — IdP-agnostic JWT/JWKS verification via `jose` | Accepted |
| [0033](0033-data-plane-tenant-isolation.md) | Data-plane per-tenant row isolation via `forTenant` scoping (default-tenant back-compat) | Accepted |
| [0034](0034-audit-trail-and-governance.md) | Audit trail via an `AuditLog` port recorded at the API boundary + governance surface (R3) | Accepted |
| [0035](0035-public-web-platform-three-surfaces.md) | Public web platform — marketing (apex) + dashboard (`app.`) + docs (`docs.`, Fumadocs) | Accepted |
| [0036](0036-agent-first-operations.md) | Agent-first operations — API/MCP parity rule, CLI onboarding, skills registry, remote MCP | Accepted |
| [0037](0037-multi-project-workspaces.md) | Multi-project workspaces within a tenant (`(tenantId, projectId)` scope) | Accepted |
| [0038](0038-external-agent-skill-adaptations-design-review-and-skill-observer.md) | External agent-skill adaptations (design-review, skill-observer); pm-skills declined | Accepted |
| [0039](0039-optional-independent-model-adversarial-review-codex.md) | Optional, opt-in independent-model adversarial review (Codex) | Accepted |
| [0040](0040-runtime-source-management.md) | Runtime source management — ingestion wired into the shipped runtime + REST/MCP surface + SSE | Accepted |
| [0041](0041-code-symbol-extraction-tree-sitter.md) | Code-symbol extraction with tree-sitter (WASM) → live knowledge-graph population (resolves OQ5) | Accepted |
| [0042](0042-marketing-site-design-direction.md) | Marketing site design direction — dark-only, monochrome + emerald, gate-enforced design system | Amended by 0043 |
| [0043](0043-terra-mosaic-brand-and-marketing-overhaul.md) | Terra Mosaic brand + marketing design v2 — warm palette, serif voice, living motion | Accepted |
| [0044](0044-marketing-v3-dual-themes-illustration-first-live-graph.md) | Marketing v3 — dual themes (Desert Rose/Modern Minimalist), illustration-first, live-graph hero | Amended by 0045 |
| [0045](0045-marketing-v4-constellation-shader-hero-theme-true-chapters.md) | Marketing v4 — shader-field hero, canvas constellation graph, theme-true chapter bands | Accepted |
| [0046](0046-brand-mascot-tess.md) | Brand mascot "Tess" — shared tessera-built character (`@tessera/mascot`), data-driven moods, CSS motion, usage budget | Accepted |

## Conventions

- Filenames: `NNNN-kebab-title.md`, zero-padded, monotonically increasing.
- Status lifecycle: `Proposed → Accepted → (Deprecated | Superseded)`.
- Each ADR links forward/back to related ADRs and to the PRD / architecture sections
  it affects.
