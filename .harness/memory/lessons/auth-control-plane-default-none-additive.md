---
id: auth-control-plane-default-none-additive
kind: lesson
title: Add auth as an injected port whose default adapter is zero-auth full-access
links:
  - apps/api/src/auth
  - apps/api/src/server.ts
  - docs/adr/0028-api-auth-tenancy-rbac.md
  - .harness/state/effects.json
confidence: 0.9
created: 2026-07-03
---

**What happened:** F-025 added authentication + org RBAC + scoped tokens to `@tessera/api`
(FR-52/FR-54/NFR-2) without breaking any of the ~18 existing REST/SSE e2e tests or the web/MCP/SDK
consumers. The trick was to treat auth as a **port injected into `buildServer`** whose **default
adapter grants full access** (`createLocalAuthProvider` — a full-access principal in the `default`
tenant, ignoring credentials). Unauthenticated requests keep working exactly as before; enforcement
engages **only** when a credential-requiring provider (`createTokenAuthProvider`) is injected.

**How to apply:**

- **Default-none, opt-in enforcement.** A new cross-cutting security layer should default to the
  *current* behavior. Make the strict adapter something a profile/test injects, and prove both paths:
  one e2e that the default build still serves unauthenticated (back-compat), one that the strict
  build returns 401/403/200 correctly.
- **RBAC as a pure function.** Keep one source of truth (`ROLES`, `PERMISSIONS`, `ROLE_PERMISSIONS`)
  and derive effective permissions = roles' permissions **∩** a token's `scopes` (least privilege —
  a token can never exceed its scope even if its role would allow it). Authorize per route with a
  tiny `requirePermission(p)` guard; reuse the existing error envelope (`Unauthorized`→401,
  `Forbidden`→403) so no new error path is invented.
- **Tokens: hash at rest, return the secret once.** Store `sha256(secret)` keyed lookups, never the
  plaintext; make revoke a state flag that `verify` checks. Prefix secrets (`tsk_`) for scanners.
- **Don't overclaim isolation.** Carrying `tenantId` on the `AuthContext` at the boundary is *not*
  cross-tenant data isolation — that needs the domain stores tenant-scoped. Land the boundary now,
  make row-scoping + live OIDC honest, documented seams (the same local-first + cloud-seam precedent
  as [[verify-cloud-adapter-env-guarded-against-a-container]]), and say so in the ADR + effect (E-018).

Pairs with [[mcp-twin-surface-type-only-and-inmemory-e2e]] (one model reused across REST + the coming
MCP gateway, F-026) and [[enum-driven-contract-additive-variant]] (a single catalog constant that
consumers derive from). See [[harness-model]].
