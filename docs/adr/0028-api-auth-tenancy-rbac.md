# ADR-0028: API auth — AuthProvider port, tenancy + RBAC model, scoped tokens (OIDC + row-isolation as seams)

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** api, auth, authz, rbac, multi-tenancy, tokens, security, deployment

## Context

FR-52 (Managed Cloud: multi-tenant, org/workspace isolation), FR-54 (multi-user collaboration with
RBAC), and NFR-2 (OIDC for hosted; org RBAC; scoped, revocable API tokens; least-privilege) require an
authentication + authorization layer on the HTTP surface. The architecture already names an
**`AuthProvider` port** in `@tessera/api` with a `none/local` local adapter and an `OIDC + RBAC` cloud
adapter (ARCHITECTURE §6), and marks tenancy as "row/schema-level isolation per tenant in cloud" (§14).
The engine has been built **local-first** throughout (ADR-0003): a port with a local adapter now and a
cloud adapter later, each behind the same interface, with cloud paths verified env-guarded (ADR-0026 for
Postgres, F-005 for embeddings). R0 was explicitly **auth: none/local** — the dashboard and existing
clients send no credentials, and every existing test drives the surface unauthenticated.

The decision is the **shape of the auth control plane, how far to enforce tenancy now, and what stays a
seam** — without breaking any existing, verified route or client.

## Decision

**Deliver the authn/authz control plane fully inside `@tessera/api`, additively, with the default profile
staying exactly zero-auth. Deep data-plane per-tenant isolation and live OIDC are documented, env-guarded
seams.**

- **RBAC model** (`auth/model.ts`, pure): `ROLES` (owner/admin/member/viewer) → a `PERMISSIONS` catalog
  (`search:read`, `compile:read`, `effects:read`, `memory:read`, `memory:write`, `admin:manage`) via
  `ROLE_PERMISSIONS` (the single source of truth). A `Principal` may carry token `scopes`;
  `effectivePermissions` = the roles' permissions **intersected** with those scopes (least privilege — a
  token can never exceed what it was scoped to). `AuthContext = { principal, tenantId, permissions }`.
- **`AuthProvider` port** (`auth/provider.ts`): `authenticate(input) → AuthContext` (throws
  `UnauthorizedError` → 401). Adapters:
  - `createLocalAuthProvider` — **none**: full-access default principal in the `default` tenant, ignoring
    credentials. This is the `buildServer` default, so local behavior is unchanged.
  - `createTokenAuthProvider` — requires a valid `Bearer` token resolved by the `TokenStore`.
- **`TokenStore` port** (`auth/token-store.ts`) + `createInMemoryTokenStore`: scoped, **revocable** API
  tokens; `tsk_`-prefixed cryptographic secrets **hashed at rest** (SHA-256; plaintext returned once).
- **Enforcement** (`auth/plugin.ts`): `registerAuth` adds an `onRequest` hook that resolves
  `request.authContext` for every non-`public` `/v1` route; `requirePermission(p)` is a per-route
  `preHandler` guard (missing context → 401, insufficient permission → 403), both via the standard
  `{error}` envelope. `buildServer` gains `auth?` (default local none); `/v1/openapi.json` stays public.

### What is deliberately a seam (no false claims)

- **Live OIDC** — OIDC is "just another `AuthProvider`"; the concrete IdP/library (Better Auth / Auth.js /
  Keycloak) is left an **open question** (see below). Not required to satisfy the RBAC + scoped-token
  substance of FR-52/54/NFR-2 here.
- **Data-plane per-tenant row isolation** — `AuthContext.tenantId` is resolved and carried at the boundary,
  but the domain stores (memory/graph/retrieval) are **not yet tenant-scoped**; true cross-tenant isolation
  needs a tenant filter in those stores (a cross-package change, deferred behind the same profile seam that
  deferred Postgres-backed graph/memory, E-014). **No cross-tenant guarantee beyond the boundary is claimed.**
- **Composition-root wiring** — choosing a provider from config/env (and an issue-token CLI) is a one-line
  seam; the capability is proven by the token-provider e2e injecting `createTokenAuthProvider` into
  `buildServer`. A persistent (SQLite/Postgres) `TokenStore` adapter and advertising the Bearer scheme in
  the OpenAPI document are follow-ups. **MCP** gateway auth + quotas = **F-026** (reuses this model).

## Consequences

### Positive
- Real RBAC + scoped, revocable, hashed tokens + tenant resolution — the control plane hosted mode needs —
  behind a clean port, verified by unit + e2e tests.
- **Fully back-compatible:** the default none provider grants all permissions, so every existing route,
  client, and e2e is untouched; enforcement engages only when a credential-requiring provider is injected.
- Contained to `@tessera/api` (no domain/schema/consumer change); OpenAPI + response schemas unchanged, so
  the generated SDK (F-022) and MCP surface are unaffected.

### Negative / Costs
- `tenantId` is carried but not yet enforced in the data plane — the multi-tenant *isolation* half of FR-52
  is a documented seam, not shipped. Called out explicitly to avoid a false security guarantee.
- The in-memory `TokenStore` is not durable across restarts (Local adapter); persistence is a seam.
- Auth is not advertised in the OpenAPI document yet, so generated clients don't surface a security scheme.

### Neutral / Follow-ups
- OIDC adapter + a persistent `TokenStore` + tenant-scoped domain stores complete the cloud story on the
  same ports; the composition root (F-015) selects the provider by profile/env.

## Alternatives considered

- **Adopt an auth framework now (Better Auth / Auth.js / Keycloak).** Rejected for this feature: it pulls a
  heavy dependency and a running IdP into a still-offline, local-first engine, against the production-grade
  + no-toy bar, and the choice is genuinely open (business/hosting-dependent). OIDC fits the existing port
  later without reopening this decision.
- **Enforce real per-tenant row isolation across every domain store now.** Rejected: a large ripple through
  memory/graph/retrieval/storage ports for a cloud-only concern; the precedent (ADR-0026 deferring the
  Postgres graph/memory profile) is to ship the boundary + carry the tenant id and land data-plane scoping
  with the cloud profile.
- **Gateway/middleware auth outside the app.** Rejected: RBAC needs per-route permission knowledge that
  lives with the routes; an in-app port is testable via `app.inject` and reused by MCP (F-026).

## Open questions

- **OQ (R2): OIDC library / IdP** — Better Auth vs Auth.js vs Keycloak (or a hosted IdP). Deferred; the
  `AuthProvider` port makes it a localized adapter decision, to be recorded in its own ADR when the hosted
  profile is built.

## References

- FR-52, FR-54, NFR-2; ARCHITECTURE §6 (`AuthProvider` port), §14 (security/tenancy).
- [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters, local-first),
  [ADR-0016](0016-rest-api-fastify-zod-bridge.md) (REST/Zod surface),
  [ADR-0018](0018-config-loader-and-local-profile.md) (composition root / profiles),
  [ADR-0026](0026-postgres-pgvector-adapters.md) (the local-first + env-guarded-cloud precedent).
  Effects `E-003` (additive) + new `E-018`.
