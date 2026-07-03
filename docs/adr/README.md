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

## Conventions

- Filenames: `NNNN-kebab-title.md`, zero-padded, monotonically increasing.
- Status lifecycle: `Proposed → Accepted → (Deprecated | Superseded)`.
- Each ADR links forward/back to related ADRs and to the PRD / architecture sections
  it affects.
