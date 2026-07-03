# Plan: F-025 — Multi-tenancy + org RBAC

- **Feature:** F-025 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-52, FR-54, NFR-2
- **ADRs:** **0028 (new — API auth: AuthProvider port, tenancy + RBAC model, scoped tokens, OIDC seam)**; relates to ADR-0003 (ports & adapters), 0016 (REST/Zod), 0018 (config/local profile)
- **Package:** `@tessera/api` (extend) · **Author:** Claude · **Date:** 2026-07-03
- **Verification:** typecheck · lint · test · e2e (keep format + build green)

## Intent
Give Tessera's HTTP surface an **authentication + authorization control plane** so a hosted
deployment can serve **multiple tenants** with **role-based access control** and **scoped,
revocable API tokens** (FR-52/FR-54/NFR-2) — while the **default local profile stays exactly
zero-auth** (single tenant, full access, no login). "Done" = every `/v1` request resolves an
`AuthContext {principal, tenantId, permissions}` via an injectable `AuthProvider`, each route is
guarded by a required permission (401/403 in the standard `{error}` envelope), and none of this
changes the local behavior existing routes/tests rely on.

## Scope (acceptance is the contract — nothing more)
- **In (control plane, fully in `@tessera/api`):**
  - Tenancy + RBAC **domain model**: `TenantId`, `Role` (owner/admin/member/viewer), a
    `Permission` catalog, a `ROLE_PERMISSIONS` mapping, `Principal`, `AuthContext`, and
    least-privilege `effectivePermissions` (a token can never exceed its own scopes).
  - **`AuthProvider` port** + adapters: `createLocalAuthProvider` (**none** — full-access default
    principal in the default tenant; today's behavior) and `createTokenAuthProvider` (requires a
    valid Bearer token; missing/invalid → 401).
  - **`TokenStore` port** + `createInMemoryTokenStore` — issue (returns the secret **once**),
    `verify` (secrets **hashed at rest**, never stored plaintext), `revoke`, `list` per tenant.
  - **Fastify enforcement**: a v1-scoped `preHandler` that authenticates into
    `request.authContext`; a `requirePermission(p)` guard per route; `/v1/openapi.json` stays
    public. `buildServer` gains an `auth?` option (default = local none).
- **Deliberately out (documented seams — honest, precedent per F-023/F-021):**
  - **Data-plane row isolation** (per-tenant filtering inside memory/graph/retrieval stores): the
    `tenantId` is resolved, carried, and enforced at the boundary; making the **domain stores**
    tenant-scoped is a cross-package change deferred behind the same seam that deferred the
    Postgres graph/memory profile (E-014). No cross-tenant guarantee is claimed beyond the boundary.
  - **Live OIDC** verification: OIDC is "just another `AuthProvider`"; the concrete IdP/library
    (Better Auth / Auth.js / Keycloak) stays an **open ADR** and an env-guarded cloud adapter.
  - **Composition-root wiring** (config/server env → choose provider, issue-token CLI): a one-line
    seam; the capability is proven by tests that inject `createTokenAuthProvider` into `buildServer`.
  - **MCP** auth + quotas = **F-026** (separate feature/package).
  - Persistent (SQLite) `TokenStore` adapter: mirrors the memory/graph sqlite adapters — a seam.

## Approach — mirror the ports-and-adapters + local-first + cloud-seam pattern
`AuthProvider` and `TokenStore` are ports the way the storage/memory ports are: one interface, a
**local adapter** now, cloud adapters as documented seams. The default `buildServer` auth is the
**none** provider, so an unauthenticated request gets a full-access default principal in tenant
`default` — **identical** to current behavior, so every existing route + e2e stays green. Turning
on real auth is purely a matter of injecting a different `AuthProvider` (proven by tests).

RBAC is a pure function: role → permission set, intersected with a token's scopes (least
privilege). Each route declares the permission it needs; one guard enforces it against
`request.authContext`. Errors reuse the existing envelope: `UnauthorizedError`→401,
`ForbiddenError`→403 (`@tessera/core` already defines both codes; `statusForCode` already maps them).

### Increments (each keeps gates green)
1. **Domain model** (`auth/model.ts`) + unit tests — no wiring yet.
2. **Ports + local adapters** (`auth/token-store.ts`, `auth/provider.ts`) + unit tests.
3. **Enforcement** (`auth/plugin.ts`: request decoration, authenticate hook, `requirePermission`) +
   wire `buildServer`/`registerV1Routes` + per-route guards; back-compat check (default build green).
4. **e2e** (token provider: 401 / 403 / 200 / revoked / public openapi) + ADR-0028 + effects + docs.

## Files to touch
- `apps/api/src/auth/model.ts` — **new**: roles, permissions, `ROLE_PERMISSIONS`, `Principal`,
  `AuthContext`, `effectivePermissions`, `hasPermission`, `DEFAULT_TENANT_ID`.
- `apps/api/src/auth/token-store.ts` — **new**: `TokenStore` port + `createInMemoryTokenStore`
  (crypto random secret `tsk_…`, SHA-256 hash at rest, revoke, list).
- `apps/api/src/auth/provider.ts` — **new**: `AuthProvider` port + `AuthInput`,
  `createLocalAuthProvider`, `createTokenAuthProvider`, `parseBearer`.
- `apps/api/src/auth/plugin.ts` — **new**: `request.authContext` decoration + module augmentation,
  `registerAuth(v1, provider)` preHandler, `requirePermission(p)` guard.
- `apps/api/src/auth/index.ts` — **new**: barrel.
- `apps/api/src/auth/*.test.ts` — **new**: model, token-store, provider unit tests.
- `apps/api/tests/e2e/auth.e2e.test.ts` — **new**: enforcement over `app.inject`.
- `apps/api/src/server.ts` — add `auth?: AuthProvider` to `BuildServerOptions`; pass through.
- `apps/api/src/routes/v1/index.ts` — `registerAuth` before routes; mark openapi route public.
- `apps/api/src/routes/v1/{search,compile,effects,memory}.ts` — add `preHandler: requirePermission(…)`.
- `apps/api/src/index.ts` — export the auth surface (for the composition root to inject).
- `docs/adr/0028-*.md` + `docs/adr/README.md` — record the decision + open OIDC-library question.
- `apps/api/AGENTS.md` — note the auth/RBAC surface + the local-none default.
- `.harness/state/effects.json` — **new E-018** (auth/tenancy contract) + touch E-003.
- `.harness/state/{feature_list.json,progress.md}` — status → done + effects; progress entry.

## Anticipated effects
- **E-003** (REST/MCP contracts): additive — a cross-cutting auth preHandler + new 401/403 paths on
  existing routes; response schemas unchanged; OpenAPI regenerates. MCP unaffected (F-026).
- **E-018 (new)** — the auth/tenancy/RBAC contract: `AuthProvider`/`TokenStore` ports + the
  permission catalog + `AuthContext.tenantId`. Dependents: route guards, the composition root that
  picks a provider (seam), and the future data-plane row-scoping + OIDC adapter.

## Test plan
- **Unit:** role→permission mapping; `effectivePermissions` intersects token scopes (least
  privilege); `hasPermission`. Token store: issue-returns-secret-once, hashed-at-rest (stored ≠
  plaintext), verify resolves, revoke→null, unknown→null, list-by-tenant. Providers: local returns
  full-access default; token requires valid bearer (missing→401, bad→401, valid→scoped context).
- **E2E (`app.inject`):** default build (none) → unauthenticated `/v1/search` still 200 (back-compat);
  token build → no token 401, viewer→`memory:write` 403, member→200, revoked token 401; `/v1/openapi.json`
  public under auth.
- **Regression:** existing api unit + e2e stay green unchanged.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` ·
`pnpm test` · `pnpm test:e2e` · `pnpm build` — all workspace-wide green; capture counts.

## Risks / open questions
- **Over-reach into the data plane.** True cross-tenant isolation needs tenant-scoped domain stores
  — a large ripple. Mitigation: deliver the control plane + carry `tenantId`; document row-scoping
  as the seam (no false isolation claim). Recorded in ADR-0028.
- **OIDC library** (OQ, R2): deliberately deferred — OIDC is an `AuthProvider` adapter; the choice is
  an open ADR. Not needed to satisfy FR-52/54/NFR-2's RBAC + scoped-token substance here.
- **Back-compat.** The default-none provider must grant all permissions so existing routes/e2e are
  untouched — asserted by a dedicated e2e.
- **SSE auth.** `EventSource` can't send `Authorization`; `/v1/events` works under local-none;
  query-token auth for cloud SSE is a documented seam.
