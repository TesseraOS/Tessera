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
| [0023](0023-adopt-efferd-dashboard-3-design-reference.md) | Adopt efferd Dashboard 3 as the binding dashboard design reference (dark-first, shadcn) | Superseded in part by 0047 |
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
| [0047](0047-dashboard-multi-theme-illustration-layer-contrast-gate.md) | Dashboard 4-theme system (Monkai/Amber/Claude/Notebook × light/dark), radial appearance propagation, illustration layer + Tess, executable WCAG-AA contrast gate | Superseded in part by 0053 |
| [0048](0048-dashboard-auth-httponly-cookie-proxy.md) | Dashboard auth: httpOnly-cookie session behind a same-origin Next proxy (closes 0022 onto the SDK) | Accepted |
| [0049](0049-data-governance-retention-dsr-mcp-audit.md) | Data governance: memory retention (delete-only), DSR export/erasure retaining the audit trail, MCP-surface audit on the existing taxonomy | Accepted |
| [0050](0050-sse-tenant-scoped-event-stream.md) | Tenant-scope the `/v1/events` SSE stream via a server-side `tenantId` stripped before the wire (closes a cross-tenant leak; `document.*` stays default-attributed until F-071) | Accepted |
| [0051](0051-audit-trail-is-chronological-no-column-sorting.md) | The audit trail is chronological: cursor pagination instead of column sorting, and no table library — the cursor *is* the sort order, so client-side sorting would lie; `aria-rowcount={-1}` because the total is genuinely unknown | Accepted |
| [0052](0052-dependency-audit-via-trivy-not-pnpm-audit.md) | The dependency audit runs on Trivy over `pnpm-lock.yaml` at HIGH+, not `pnpm audit` (npm retired the legacy endpoints; the fix exists only in pnpm 11) — the gate had been failing open over a real critical + high, now fixed | Accepted |
| [0053](0053-overview-leads-with-state-not-a-greeting-band.md) | The Overview leads with state: the greeting hero retires (supersedes 0047's hero-band budget in part), onboarding gates on `/v1/stats` rather than the session-only feed, and the activity chart starts no earlier than the oldest event the audit trail actually holds — so a pruned day cannot render as "nothing happened" | Accepted |
| [0054](0054-docs-surface-terra-mosaic-reading-chrome-and-generated-reference.md) | Docs surface (apps/docs): Terra Mosaic reading chrome (dual themes + radial ripple, mono returns), Fumadocs themed only through the `--color-fd-*` seam (no forks), and the generated-reference pipeline (prose authored, facts generated + drift-gated) | Accepted |
| [0057](0057-ingestion-scope-on-the-queue-job.md) | Ingestion scope travels on the queue job: `ChangeEvent` gains a REQUIRED `(tenantId, projectId)` (never optional — an optional scope keeps the silent-default failure mode), `DocumentSink` gains `forTenant`/`forProject` scoped views (compiler-enforced vs. a droppable parameter), and scope NEVER enters `ProcessedDocument`/the plugin stages (it would be plugin-forgeable). The worker validates the job and never defaults. Supersedes ADR-0040's deferral; closes ADR-0050's `document.*` gap | Accepted |
| [0056](0056-entitlement-clamp-silent-and-metered-only.md) | The compile entitlement clamp: SILENT on `compile_context` (the clamp is already derivable — `pkg.budget` IS the effective budget) but PUBLISHED in the tool description, named explicitly in `explain`, and applied to METERED deployments only — a self-hosted deployment that wired no `BillingProvider` is not "on the free plan" and is not capped; the cloud Free tier keeps its 8000 | Accepted (§3 mechanism superseded in part by 0060) |
| [0055](0055-trunk-based-main-with-a-remote.md) | Trunk-based development on `main` even though a remote exists — branch-per-feature + PR is retired (a PR adds ceremony without adding a reader when the author is the only operator; the evaluator pass is the real independent check). Guardrails unchanged: green-only commits, reviewed diffs, and pushing still needs an explicit request every time | Accepted |
| [0059](0059-self-hosted-profile-and-deployment-artifacts.md) | The self-hosted profile: a shared `assembleRuntime` with two thin profile modules and a DYNAMIC import of the self-hosted branch (a static one would drag bullmq/ioredis/pg into the local stdio binary, breaking FR-50's zero-external-services promise); Postgres adapters never create their own tables — each package exports a `Migration[]` and the composition root applies them once under `pg_advisory_lock`, because the existing runner read-then-applies and two replicas would race; retriever ports go fully `async` rather than `void \| Promise<void>` (a union is silently ignorable — the ADR-0057 argument); BullMQ taken as a dependency, S3 SigV4 hand-rolled over `fetch` and explicitly reversible. Records that "boots for real" is ELEVEN adapters, not the four the acceptance named — any SQLite left in the data path caps self-hosted at one node | Accepted |
| [0058](0058-remote-mcp-http-transport.md) | Remote MCP over streamable HTTP: a Fastify-free `@tessera/mcp/http` subpath mounted onto the existing app by the composition root (a route in `@tessera/api` would be a workspace cycle), STATEFUL sessions (stateless means a fresh 20-tool `McpServer` per request — `Protocol.connect` refuses transport reuse) with four teardown paths because `client.close()` sends no DELETE, and connection-level auth on `McpGateway.authenticate` so the boundary and the tools share one credential resolver — the SDK's `requireBearerAuth` rejects the non-expiring tokens Tessera issues. Off by default; refuses to start when `auth.mode` is `none`. Completes ADR-0029's recorded gap | Accepted |
| [0060](0060-usage-metering-analytics-and-the-metered-predicate.md) | Usage metering: the contract lives in `@tessera/billing` beside the entitlements it serves; "metered" becomes an EXPLICIT flag (`provider !== 'none'`) rather than an object-presence test — which fixes shipped behaviour, because the composition root always wires a provider and so every Local and self-hosted deployment is capped at the cloud free tier's 8000 tokens today, exactly what ADR-0056 §3 decided must not happen; latency is measured at the metering boundary and reported as **average + slowest**, never p95 (a sum and a max cannot produce a percentile, and there are no readable OTel metrics to read — no meter provider is ever registered); UTC day buckets with typed columns and deliberately **no `principal_id`**, because that one column would turn billing evidence into DSR-erasable personal data; one failure-isolated recorder per surface; the monthly guard reuses `RateLimitedError` and **fails open** | Accepted |
| [0061](0061-feature-flags-plugin-permissions-and-plugin-health.md) | Feature flags become a `FlagProvider` PORT in `@tessera/core` (dependency-free, so the API evaluates per tenant with no new workspace edge) with a static config-backed adapter and a remote provider as a real seam; plugin permissions are a CLOSED vocabulary declared on the manifest, validated at load and gated denied-by-default at the host boundary — explicitly **declaration, not containment**, since ADR-0020 already recorded that a plugin runs in-process; plugin `health()` + restart/backoff aggregate over a host the runtime finally HOLDS (`Runtime.plugins`), and `/ready` reports the empty set honestly (`0 plugins registered`) because routing embeddings through the host would regress F-085's worker pool and routing connectors through it needs a multi-instance host — filed, not smuggled in | Accepted |

## Conventions

- Filenames: `NNNN-kebab-title.md`, zero-padded, monotonically increasing.
- Status lifecycle: `Proposed → Accepted → (Deprecated | Superseded)`.
- Each ADR links forward/back to related ADRs and to the PRD / architecture sections
  it affects.
