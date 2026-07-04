# Tessera

> **Context & Memory Operating System for AI coding agents.**
> Tessera captures knowledge from code, Git, docs, PRs, issues, chats, and IDE
> activity, then **compiles** task-aware context packages — not naive RAG dumps —
> using memory, a project knowledge graph, and hybrid retrieval. One platform runs
> **Local, Self-Hosted, Managed Cloud, and Enterprise** behind identical API + MCP
> interfaces.

> _A tessera is a single tile in a mosaic. Tessera assembles thousands of scattered
> fragments of project knowledge into one coherent picture, on demand, per task._

| | |
|---|---|
| **Status** | In build. R0–R2 engine complete (37 features, gates green); R3 (product completeness) and R4 (launch) in progress — see [`docs/roadmap.md`](docs/roadmap.md) and [`.harness/state/feature_list.json`](.harness/state/feature_list.json). Not yet released. |
| **Codename** | `ContextOS` (internal only — the public brand is **Tessera**). |
| **Package scope** | `@tessera/*` |
| **License** | Open-core (PRD OQ4, resolved 2026-07-03); license files land with launch readiness (F-059). |

---

## Why Tessera

AI coding agents fail less from weak models and more from **bad context**: stale
snippets, missing decisions, no awareness that changing one function breaks three
others. Tessera treats **context as a compiled artifact** with provenance, ranking,
deduplication, and compression — and tracks **effect-links** so an agent learns that
editing `A` requires touching `B` and `C`.

The two differentiators we build around:

1. **Context Compiler** — `plan → retrieve → expand → rank → dedup → compress →
   assemble`, every package explainable with provenance.
2. **Effect-links** — a first-class graph of "change here implies change there,"
   surfaced to agents so they stop fixing one place and breaking others.

## What's here today

The **engine is built and verified** (R0–R2): ingestion connectors (filesystem/Git/GitHub),
memory, knowledge graph + effect-links, hybrid retrieval (5 signals + fusion), the Context
Compiler, REST `/v1` + MCP surfaces, generated TS SDK, auth/RBAC/tenant isolation, audit
trail, billing port, Postgres/pgvector adapters, observability — all behind verification
gates (typecheck/lint/test/build/e2e/a11y, all green).

**In progress:** R3 wires the engine into the shipped runtime end-to-end (runtime source
management, live indexing, dashboard completion, hardening, full-stack E2E) and R4 delivers
the launch surface (marketing/docs/skills sites, CLI, deployment artifacts). The build is
governed by the in-repo agent harness — see [`AGENTS.md`](AGENTS.md) and
[`.harness/state/`](.harness/state/) — **one feature at a time**.

- [`docs/PRD.md`](docs/PRD.md) — product requirements.
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) — system design.
- [`docs/adr/`](docs/adr) — Architecture Decision Records (the "why").
- [`docs/glossary.md`](docs/glossary.md), [`docs/roadmap.md`](docs/roadmap.md).

## Layout (monorepo)

```
tessera/
├── apps/
│   ├── api/        # @tessera/api    — Fastify REST /v1 (modular monolith surface)
│   ├── mcp/        # @tessera/mcp    — MCP server (same services as REST)
│   ├── server/     # @tessera/server — runnable bins (tessera-api / tessera-mcp / tessera-token)
│   └── web/        # @tessera/web    — Next.js dashboard (app subdomain; marketing + docs apps arrive in R4, ADR-0035)
├── packages/       # @tessera/*      — core, storage, ai, ingestion, memory, knowledge-graph,
│                   #                   retrieval, context-compiler, config, observability,
│                   #                   plugin-host, billing, sdk
├── docs/           # PRD, architecture, ADRs, design system
├── .harness/       # tool-agnostic agent harness (system of record)
└── .claude/        # Claude Code adapter for the harness
```

## Development requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | `22.16.0` (see [`.nvmrc`](.nvmrc)) | LTS line. |
| pnpm | `>= 9` | Workspace package manager. |
| Git | `>= 2.34` | |
| Docker | optional | Only for self-hosted / cloud-parity local stacks. |
| Ollama | optional | Optional local embedding/LLM runtime. |

## Deployment modes (one architecture, configuration-selected)

| Mode | Storage | Auth | Intended user |
|------|---------|------|---------------|
| **Local** | SQLite + sqlite-vec, in-process | none/local | individual developer |
| **Self-Hosted** | Postgres + pgvector + object store | OIDC | a team on its own infra |
| **Managed Cloud** | multi-tenant Postgres + pgvector | OIDC + org RBAC | hosted SaaS |
| **Enterprise** | dedicated / VPC | SSO + audit + retention | regulated orgs |

Deployment is **configuration, not a fork** — see the ports & adapters design in
[`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md).

---

© Tessera. All rights reserved. Branding and license terms are tracked in
[`docs/adr/0008-brand-tessera-and-package-scope.md`](docs/adr/0008-brand-tessera-and-package-scope.md).
