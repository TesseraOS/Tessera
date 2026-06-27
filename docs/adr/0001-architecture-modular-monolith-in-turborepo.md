# ADR-0001: Modular monolith in a Turborepo + pnpm monorepo

- **Status:** Accepted
- **Date:** 2026-06-27 (ratified; originally agreed 2026-06-25)
- **Deciders:** Project lead, Claude
- **Tags:** architecture, repo, backend

## Context

Tessera spans a backend engine, a Next.js dashboard, an SDK, an MCP server, and a
plugin ecosystem. We must ship quickly with a small team while keeping the door open
to extracting independently-scalable services later (ingestion workers, retrieval,
embeddings). The two failure modes to avoid: (a) a distributed system before we have
the load or the team to operate one, and (b) a tangled single package that can never
be split.

## Decision

We will build a **modular monolith** organized as a **Turborepo + pnpm workspace**:

- `apps/api` — the deployable backend (one process by default).
- `apps/web` — the Next.js dashboard.
- `packages/*` — domain modules with **explicit, enforced boundaries** (e.g.
  `@tessera/context-compiler`, `@tessera/retrieval`, `@tessera/knowledge-graph`,
  `@tessera/storage` ports, `@tessera/ingestion`, `@tessera/core`, `@tessera/sdk`,
  `@tessera/mcp`).

Modules communicate through **published package interfaces and a domain event bus**,
never through reaching into each other's internals. This makes a later split to
separate services a deployment/transport change, not a rewrite.

## Consequences

### Positive
- One repo, one install, one CI graph; Turbo caches task outputs for fast builds.
- Strong module boundaries give us microservice-grade decoupling without the ops cost.
- A feature can touch compiler + retrieval + storage in a single atomic change.

### Negative / Costs
- Boundaries must be **enforced** (lint rules, `package.json` `exports`, dependency
  cruiser / eslint-plugin-boundaries), or the monolith rots into a big ball of mud.
- Everything shares a runtime by default; a runaway module can affect neighbors until
  we split.

### Neutral / Follow-ups
- Define the boundary-enforcement tooling as an early harness rule (Phase B).
- Revisit extraction of ingestion/embeddings into workers when sustained queue depth
  or CPU pressure justifies it (tracked as a roadmap milestone, not now).

## Alternatives considered

- **Microservices from day one** — premature; multiplies deployment, networking,
  and observability cost before product-market fit, and slows iteration.
- **Single-package app** — fastest to start, impossible to split cleanly later;
  rejected against the "splittable without rewrite" requirement.
- **Nx instead of Turborepo** — capable, but heavier and more opinionated than we
  need; Turbo + pnpm is lighter and sufficient.

## References

- [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters),
  [ADR-0002](0002-backend-framework-fastify.md), `docs/architecture/ARCHITECTURE.md`.
