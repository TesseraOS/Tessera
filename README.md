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
| **Status** | **Not yet released.** 82 of 98 tracked features are done and the verification gates are green; R0–R3 are complete and R4 (launch) is in progress. See [`docs/roadmap.md`](docs/roadmap.md) and [`.harness/state/feature_list.json`](.harness/state/feature_list.json). |
| **License** | **Apache-2.0** ([`LICENSE`](LICENSE)) — the whole repository. The commercial tier is the hosted service, not a carved-out package ([ADR-0062](docs/adr/0062-apache-2-licence-whole-repo-oss-and-the-publish-closure.md)). |
| **Security** | Report privately — see [`SECURITY.md`](SECURITY.md). |
| **Package scope** | `@tessera/*` (nothing published yet) |
| **Codename** | `ContextOS` (internal only — the public brand is **Tessera**). |

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

## Quickstart

> **From source.** Nothing is on npm yet — the release pipeline exists but has never been
> dispatched (see [Releasing](#releasing)). Until then, run it from a clone.

```bash
git clone https://github.com/TesseraOS/Tessera.git && cd Tessera && pnpm install && pnpm build
```

Check the toolchain, config, storage and embeddings are healthy:

```bash
pnpm tessera doctor
```

Scaffold a Local deployment — SQLite, local embeddings, **no external services and no API keys**:

```bash
pnpm tessera init
```

Index a repository:

```bash
pnpm tessera source add --kind git --root /path/to/your/repo
```

Point an agent at it. `mcp-config` emits ready-to-paste configuration for Claude Code, Cursor,
Cline, Codex and Continue:

```bash
pnpm tessera mcp-config --client claude-code
```

Or serve the REST API:

```bash
pnpm tessera serve
```

The full command set is `init`, `serve`, `mcp`, `source`, `token`, `doctor`, `mcp-config` and
`skills` — run `pnpm tessera --help` for details. (`pnpm tessera` is a root alias for the built
CLI; once the package is published this is just `tessera`.)

## What's here today

The engine is **built and verified**: ingestion connectors (filesystem/Git/GitHub), versioned
memory, the knowledge graph with effect-links, hybrid retrieval (five signals plus rank fusion),
the Context Compiler, REST `/v1` and MCP surfaces (stdio and remote HTTP), a generated TypeScript
SDK, auth/RBAC with tenant and project isolation, an audit trail, usage metering and a billing
port, Postgres/pgvector and S3 adapters for self-hosting, feature flags, a plugin host, and
observability.

Three web surfaces ship alongside it: the **dashboard** (`apps/web`), the **marketing site**
(`apps/marketing`) and the **documentation site** (`apps/docs`, with generated API and env
references that are drift-gated against the code).

**What remains** is R4 launch work — deployment artifacts, notifications, i18n readiness, and the
operator/legal finalization — tracked as open features in
[`.harness/state/feature_list.json`](.harness/state/feature_list.json).

Everything is built **one feature at a time** under the in-repo agent harness: plan, implement,
verify against gates, trace effects, record. See [`AGENTS.md`](AGENTS.md).

- [`docs/PRD.md`](docs/PRD.md) — product requirements.
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) — system design.
- [`docs/adr/`](docs/adr) — Architecture Decision Records (the "why").
- [`docs/glossary.md`](docs/glossary.md), [`docs/roadmap.md`](docs/roadmap.md).

## Layout (monorepo)

```
tessera/
├── apps/
│   ├── api/        # @tessera/api    — Fastify REST /v1 (modular monolith surface)
│   ├── mcp/        # @tessera/mcp    — MCP server (same services as REST; stdio + HTTP)
│   ├── server/     # @tessera/server — runnable bins (tessera-api / tessera-mcp / tessera-token)
│   ├── cli/        # @tessera/cli    — `tessera` one-command onboarding
│   ├── web/        # @tessera/web    — Next.js dashboard (app subdomain, ADR-0035)
│   ├── marketing/  # @tessera/marketing — public marketing site (apex domain; Terra Mosaic)
│   └── docs/       # @tessera/docs   — documentation site (Fumadocs, generated references)
├── packages/       # @tessera/*      — core, storage, ai, ingestion, memory, knowledge-graph,
│                   #                   retrieval, context-compiler, config, observability,
│                   #                   plugin-host, billing, sdk, skills, brand, mascot
├── tests/          # cross-cutting suites — bench, e2e-full, web-perf
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

Verification gates (run in order; green is the only acceptable state):

```bash
node scripts/verify-state.mjs && pnpm -w typecheck && pnpm -w lint && pnpm -w format:check && pnpm -w test && pnpm -w build
```

## Deployment modes (one architecture, configuration-selected)

| Mode | Storage | Auth | Intended user |
|------|---------|------|---------------|
| **Local** | SQLite + sqlite-vec, in-process | none/local | individual developer |
| **Self-Hosted** | Postgres + pgvector + object store | OIDC | a team on its own infra |
| **Managed Cloud** | multi-tenant Postgres + pgvector | OIDC + org RBAC | hosted SaaS |
| **Enterprise** | dedicated / VPC | SSO + audit + retention | regulated orgs |

Deployment is **configuration, not a fork** — see the ports & adapters design in
[`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md).

## Releasing

Releases are dispatched manually and **do not publish by default**: the workflow builds, packs and
generates an SBOM on every run, and reaches `npm publish` only when explicitly asked to. See
[ADR-0062](docs/adr/0062-apache-2-licence-whole-repo-oss-and-the-publish-closure.md).

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — it is the operating manual for humans and agents alike, and
it is binding. In short: one feature at a time, plan before code, verification is the proof rather
than an assertion, and every deviation from a documented default gets an ADR.

---

Licensed under the [Apache License 2.0](LICENSE). Third-party attributions are in
[`NOTICE.md`](NOTICE.md). *Tessera* is a project name and brand — see
[ADR-0008](docs/adr/0008-brand-tessera-and-package-scope.md); the licence grants no trademark
rights (Apache-2.0 §6).
