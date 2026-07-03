# ADR-0032: OIDC AuthProvider — IdP-agnostic JWT/JWKS verification via `jose`

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** api, auth, oidc, jwt, security, deployment

## Context

NFR-2 calls for **OIDC** in hosted modes. ADR-0028 left "the concrete IdP/library (Better Auth /
Auth.js / Keycloak)" as an open question and shipped the `AuthProvider` port with local/token adapters,
noting OIDC as "just another provider." F-036 builds that provider. The apparent blocker — *which auth
product* — dissolves under the port model: Tessera does not run an IdP or a login UI; it **verifies
tokens** issued by whatever conformant OIDC IdP the operator already runs. So the only real decision is
the **token-verification library** and the **claim → principal mapping**.

## Decision

**Add an IdP-agnostic OIDC `AuthProvider` that verifies Bearer JWTs against the IdP's JWKS with `jose`,
selected by `auth.mode = oidc`. No IdP-specific SDK; no login/session code in Tessera.**

- **`createOidcAuthProvider({ issuer, audience, jwksUri?, rolesClaim?, tenantClaim?, defaultRole?,
  clockToleranceSec?, keySet? })`** (in the Fastify-free `@tessera/api/auth` core):
  - Verifies the Bearer JWT with **`jose`** (`jwtVerify` against `createRemoteJWKSet`), checking
    signature, `iss`, `aud`, and expiry. The JWKS is fetched + cached from the IdP; tests inject a local
    key set (`keySet`) to stay offline.
  - Maps claims → `Principal`: `sub` → id, a **roles claim** (array or space/comma-delimited) filtered to
    the RBAC catalog (unknown/empty → `defaultRole = viewer`), a **tenant claim** → `AuthContext.tenantId`
    (default tenant when absent), `name`/`email` → display name.
  - Any failure → `UnauthorizedError` (401) with a generic message — the underlying reason is never leaked.
- **`jose`** is the verification library: focused, zero-dependency, standards-complete (JWK/JWKS/JWT),
  widely audited — consistent with the "fetch/small-lib over heavy SDK" ethos (ADR-0024). We do **not**
  hand-roll JWT/JWKS crypto (alg-confusion and key-import footguns).
- **Config:** `auth.mode` gains `oidc`; an `auth.oidc` section (`issuer`/`audience` required, `jwksUri`/
  `rolesClaim`/`tenantClaim` optional) with `TESSERA_AUTH_OIDC_*` env. `createRuntimeAuth` builds the
  provider via the Fastify-free subpath, so the composition root + the MCP process stay Fastify-free
  (`jose` is not Fastify).

## Consequences

### Positive
- Works with **any** OIDC IdP (Keycloak, Auth0, Entra, Okta, …) via issuer + JWKS + audience config — no
  vendor lock-in, no auth framework adopted, the open "which IdP" question retired.
- Reuses the existing `AuthProvider` port + RBAC catalog + tenant model; RBAC/quotas/entitlements all
  apply unchanged to OIDC principals.
- Verification is **offline-unit-tested** (generate an RSA keypair, sign JWTs, verify): valid → mapped
  context, expired / wrong `aud` / wrong `iss` / missing → 401, role-claim mapping.
- Fastify-free; back-compatible (default `none`).

### Negative / Costs
- New dependency `jose` on `@tessera/api`.
- Claim conventions (roles/tenant claim names) are IdP-configurable, not standardized — hence the
  configurable claim names + a documented default.
- No **live** IdP round-trip is exercised here (no IdP available); that end-to-end check is a seam.

### Neutral / Follow-ups
- Documented seams: a live-IdP integration test; token introspection / opaque-token support; a login
  helper / OIDC discovery-document auto-config; refresh/rotation concerns (client-side).

## Alternatives considered

- **Adopt an auth framework (Better Auth / Auth.js / Keycloak adapter).** Rejected: Tessera verifies
  tokens, it doesn't run login/sessions; a framework is far more surface than the port needs and would
  couple us to one product. The port keeps this a localized adapter.
- **Hand-roll JWT/JWKS with `node:crypto`.** Rejected: security-critical; `jose` is small and correct.
- **Symmetric/shared-secret tokens only.** Rejected: OIDC IdPs sign with rotating asymmetric keys served
  via JWKS; JWKS verification is the standard.

## References

- NFR-2; [ADR-0028](0028-api-auth-tenancy-rbac.md) (AuthProvider port + RBAC — OIDC anticipated here),
  [ADR-0030](0030-auth-composition-root-wiring.md) (Fastify-free `@tessera/api/auth` subpath the provider
  ships in), [ADR-0024](0024-github-connector-and-auto-memory-extraction.md) (small-lib ethos). Effects
  `E-018` (auth contract — OIDC adapter) + `E-014` (config `auth.mode=oidc` wiring).
