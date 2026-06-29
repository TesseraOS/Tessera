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

## Conventions

- Filenames: `NNNN-kebab-title.md`, zero-padded, monotonically increasing.
- Status lifecycle: `Proposed → Accepted → (Deprecated | Superseded)`.
- Each ADR links forward/back to related ADRs and to the PRD / architecture sections
  it affects.
