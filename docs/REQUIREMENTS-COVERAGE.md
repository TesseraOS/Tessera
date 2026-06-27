# Requirements coverage — original brief → where it lives

This document traces **every item in the project lead's original brief** to where it is now
captured (PRD requirement, ADR, harness, or design system), or flags it as a deliberate
gap/decision. It is the durable answer to "have all my points been addressed?" Update it
whenever scope changes.

Legend: ✅ captured · 🟡 captured as deferred/backlog · 🟢 decided "no" (with rationale) · ❓ open question.

## Core features
| Brief item | Status | Where |
|------------|:------:|-------|
| Automatic memory capture (code/Git/docs/PRs/issues/chats/IDE) | ✅ | PRD FR-1…FR-5, FR-14; F-006, F-017 |
| Context Compiler (task-aware assembly) | ✅ | ADR-0004; PRD FR-27…FR-34; F-010 |
| Hybrid retrieval (semantic/keyword/graph/temporal/symbolic) | ✅ | PRD FR-21…FR-26; F-009 (temporal F-018) |
| Project Knowledge Graph + architecture mapping | ✅ | PRD FR-16…FR-20; F-008; ARCHITECTURE §10 |
| Decision/ADR/lesson/incident/failure memory | ✅ | PRD FR-10…FR-15; F-007 |
| Compression, ranking, dedup, relevance scoring | ✅ | PRD FR-29/30/31; compiler stages |
| MCP server/gateway (Claude/Cursor/Codex/Cline/Roo/Continue) | ✅ | PRD FR-35/36; F-012, F-026 |
| Deployment modes (Local/Self-Hosted/Cloud/Enterprise) | ✅ | ADR-0003; PRD §8; F-015/F-023/F-025 |
| Next.js dashboard (search/graphs/timelines/config/analytics) | ✅ | PRD FR-41…FR-49; DESIGN-SYSTEM; F-014/F-028 |
| Plugin ecosystem (connectors/processors/AI/storage) | ✅ | PRD FR-40/58/59/60; F-013 |
| Multi-user, RBAC, governance, audit, retention, encryption | ✅ | PRD FR-54/55, FR-15, NFR-1/2/13; F-025/F-027 |
| Local AI + optional cloud LLM/embeddings | ✅ | ADR-0006; F-005 |
| OpenTelemetry observability, metrics, tracing, perf monitoring | ✅ | NFR-7; `.harness/protocols/observability.md`; F-016 |

## Major decisions
| Brief item | Status | Where |
|------------|:------:|-------|
| TypeScript monorepo (Turborepo + pnpm) | ✅ | ADR-0001 |
| Single architecture for all deployment modes | ✅ | ADR-0003 |
| Cloud-native, offline-capable; deployment = config | ✅ | ADR-0003 |
| MCP-first, agent-agnostic, API-first | ✅ | ARCHITECTURE §11; harness is agnostic-core too |
| Context compilation over naive RAG | ✅ | ADR-0004 |
| Knowledge graph + hybrid retrieval as intelligence layer | ✅ | ARCHITECTURE §8–10 |
| Storage abstraction (SQLite local; PG+vector+object cloud) | ✅ | ADR-0003/0006 |
| Event-driven ingestion w/ async workers + queues | ✅ | ARCHITECTURE §7; FR-6 |
| Plugin-based architecture | ✅ | ARCHITECTURE §12; FR-58 |
| Production-ready by default | ✅ | engineering standards; rules; NFRs |

## Open questions from the brief
| Brief question | Resolution |
|----------------|-----------|
| Local vs cloud-only? | ✅ Local-first, cloud-ready (ADR-0003) |
| Cloudflare Tunnel — build it? | 🟢 No — documented recipe only (ADR-0007) |
| Project name? | ✅ **Tessera** (ADR-0008) |
| Bun instead of Node? | 🟢 Node 22 LTS now; Bun not precluded (ADR-0002) |
| FastAPI instead of Express? | ✅ Fastify (not Express, not FastAPI) (ADR-0002) |
| Microservices instead of monorepo? | ✅ Modular monolith, splittable later (ADR-0001) |

## Backend stack (brief "Initial thoughts")
| Brief item | Status | Where |
|------------|:------:|-------|
| Node.js / TypeScript | ✅ | ADR-0002 |
| Express.js | 🟢 | replaced by **Fastify** (ADR-0002) |
| Zod (validation) | ✅ | rules/api, ARCHITECTURE §11 |
| OpenAPI (API contracts) | ✅ | FR-37; rules/api |
| Prisma/Drizzle ORM | ✅ | **Drizzle** (ADR-0005) |
| BullMQ (jobs) | ✅ | ADR-0003 (Queue port: in-proc→BullMQ); F-003 |
| OpenTelemetry / Pino logging | ✅ | NFR-7; observability protocol |
| Better Auth/Auth.js or Keycloak/OAuth | ❓ | OIDC direction set (NFR-2); specific library = ADR at R2 |
| WebSocket/SSE | ✅ | FR-38; F-021 |
| Plugin architecture | ✅ | FR-40/58; F-013 |
| Docker + Docker Compose | ✅ | ADR-0003; F-023 (R1) |
| Turborepo + pnpm | ✅ | ADR-0001; F-001 |

## Frontend stack (brief "Initial thoughts")
| Brief item | Status | Where |
|------------|:------:|-------|
| Next.js / React / TypeScript | ✅ | ADR-0009 |
| Tailwind CSS / shadcn/ui | ✅ | ADR-0009; DESIGN-SYSTEM §2/3 |
| TanStack Query / Zustand | ✅ | ADR-0009; DESIGN-SYSTEM §9 |
| React Hook Form / Zod | ✅ | ADR-0009; DESIGN-SYSTEM §3 |
| Framer Motion (micro-interactions) | ✅ | ADR-0009; DESIGN-SYSTEM §5 |
| Recharts/Tremor (analytics) | ✅ | DESIGN-SYSTEM §3 |
| React Flow (graph/architecture viz) | ✅ | DESIGN-SYSTEM §3/7 |
| Monaco Editor (memory/ADR editing) | ✅ | DESIGN-SYSTEM §3/7 |
| **Dodo Payments** | 🟡 | **ADR-0011**; F-030 (build at R2) |
| **PWA** | 🟢 | **No** — responsive web (ADR-0009 §Decision) |
| Command palette (⌘K), themes, a11y, responsive | ✅ | DESIGN-SYSTEM §3/6/8; FR-49, NFR-9 |
| Design references (tweakcn/efferd/coss/ui-skills/unabyss) | ✅ | DESIGN-SYSTEM §10 |

## Production requirements (brief checklist)
| Brief item | Status | Where |
|------------|:------:|-------|
| RBAC | ✅ | FR-54, NFR-2; F-025 |
| API versioning | ✅ | FR-37, NFR-11 |
| Rate limiting | ✅ | ARCHITECTURE §14; rules/api; NFR-1 area |
| Audit logs | ✅ | FR-55; F-027 |
| Encryption | ✅ | NFR-1; rules/security |
| Secrets management | ✅ | NFR-1; `.harness/governance/secrets-policy.md` |
| Health/readiness endpoints | ✅ | NFR-6; rules/api |
| Metrics & tracing | ✅ | NFR-7; observability protocol |
| **CI/CD** | ✅ | **ADR-0010**; F-029; NFR-15 |
| Feature flags | ✅ | FR-57 |
| Backup & restore | ✅ | FR-56; F-024 |
| Migration system | ✅ | FR-56; ADR-0005 (drizzle-kit) |
| Multi-tenancy (cloud) | ✅ | FR-52; F-025 |
| Plugin SDK | ✅ | FR-40; F-013 |
| API SDK generation | ✅ | FR-39; F-022 |
| Comprehensive testing (unit/integration/E2E) | ✅ | `.harness/rules/common/testing.md`; gates; F-001 |

## UI/UX polish (brief checklist) — all in DESIGN-SYSTEM + FR-49
Micro-interactions ✅ · smooth page transitions ✅ · optimistic updates ✅ · skeleton loaders
✅ · toasts ✅ · keyboard shortcuts ✅ · drag-and-drop ✅ · context menus ✅ · virtualized
tables/lists ✅ · real-time updates ✅ · empty/loading/error states ✅ · high-performance
rendering ✅ (DESIGN-SYSTEM §5/6/9).

## Remaining open questions (tracked)
- **OQ1** default embedding model · **OQ2** graph storage engine · **OQ3** compression
  strategy · **OQ4** license/business model (gates ADR-0011) · **OQ5** symbol extraction
  (tree-sitter vs LSP) · **Auth library** specifics (OIDC direction set). See
  [`PRD.md §12`](PRD.md#12-open-questions). Each resolves via an ADR before dependent code.
