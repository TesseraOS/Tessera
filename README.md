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
| **Status** | Pre-coding. Phase A (product definition) in progress. |
| **Codename** | `ContextOS` (internal only — the public brand is **Tessera**). |
| **Package scope** | `@tessera/*` |
| **License** | TBD (tracked in [`docs/adr`](docs/adr)). |

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

This repository is in its **definition phase**. No application code yet — by design.
The current deliverables are documents and decision records:

- [`docs/PRD.md`](docs/PRD.md) — product requirements.
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) — system design.
- [`docs/adr/`](docs/adr) — Architecture Decision Records (the "why").
- [`docs/glossary.md`](docs/glossary.md), [`docs/roadmap.md`](docs/roadmap.md).

Next comes the **agent harness** (the rules/skills/protocols/state that govern how
agents build Tessera), and only then feature code — **one feature at a time**.

## Planned layout (target monorepo)

```
tessera/
├── apps/
│   ├── api/        # @tessera/api    — Fastify backend (modular monolith)
│   └── web/        # @tessera/web    — Next.js dashboard
├── packages/       # @tessera/*      — domain packages (compiler, retrieval, kg, storage ports…)
├── docs/           # PRD, architecture, ADRs
├── .harness/       # tool-agnostic agent harness (system of record)   [Phase B]
└── .claude/        # Claude Code adapter for the harness               [Phase B]
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
