# Plan: F-036 — OIDC AuthProvider adapter (auth.mode=oidc)

- **Feature:** F-036 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** NFR-2
- **ADRs:** **0032 (new — OIDC AuthProvider, jose)**; relates to 0028 (auth port/RBAC), 0030 (Fastify-free subpath), 0024 (small-lib ethos)
- **Package:** `@tessera/api` (adapter) + `@tessera/config` (wiring) · **Author:** Claude · **Date:** 2026-07-03
- **Verification:** typecheck · lint · test (keep format + build green)

## Intent
Let hosted deployments authenticate with an external **OIDC** IdP (NFR-2) by verifying its JWTs — a
localized `AuthProvider` adapter behind the existing port, IdP-agnostic, offline-testable. Default `none`
is unchanged.

## Key realization
The "which IdP/library" open question (ADR-0028) **dissolves**: Tessera doesn't run an IdP or login — it
**verifies tokens** from whatever conformant OIDC IdP the operator runs. So no auth *product* is chosen;
the only decision is the **verifier** → `jose` (focused, zero-dep, standards-complete; not hand-rolled).

## Approach
`createOidcAuthProvider({ issuer, audience, jwksUri?, rolesClaim?, tenantClaim?, defaultRole?, keySet? })`
verifies the Bearer JWT with `jose` (`jwtVerify` against `createRemoteJWKSet`), checks iss/aud/expiry, and
maps claims → `Principal` (`sub`→id; roles claim → RBAC roles, unknown→`viewer`; tenant claim →
`AuthContext.tenantId`; name/email→display). Failures → `UnauthorizedError` (401, generic). It lives in the
**Fastify-free** `@tessera/api/auth` core (`jose` ≠ Fastify) so `@tessera/config`/the MCP process stay
clean. Config: `auth.mode` gains `oidc` + an `auth.oidc` section (issuer/audience required via
`superRefine`) + `TESSERA_AUTH_OIDC_*` env; `createRuntimeAuth` builds it via the subpath.

## Files to touch
- `apps/api/src/auth/oidc.ts` (new) + export from `auth/core.ts` + `src/index.ts`; `apps/api/package.json`
  (`jose`).
- `apps/api/src/auth/oidc.test.ts` (new — offline keypair + signed JWTs).
- `packages/config/src/{schema.ts,load.ts,profiles/local.ts}` (auth.mode=oidc + oidc section + env) +
  `schema.test.ts`.
- `.env.example` (`TESSERA_AUTH_OIDC_*` — the env-docs guard enforces it) · `docs/adr/0032-*.md` + index ·
  state + effects (E-018/E-014).

## Anticipated effects
- **E-018** (auth contract): OIDC adapter realized (a third mode alongside none/token).
- **E-014** (config): `auth.mode=oidc` + `auth.oidc` wiring via the Fastify-free subpath.

## Test plan
- **Unit (api):** generate an RSA keypair (jose), sign JWTs, verify: valid→mapped context; space-delimited
  roles + default tenant; unknown role→viewer; missing/expired/wrong-aud/wrong-iss→401.
- **Config:** `auth.mode=oidc` accepted with issuer+audience (env-mapped); rejected without them.

## Verification
`node scripts/verify-state.mjs` (incl. env-docs) · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` ·
`pnpm test` · `pnpm build`. No REST route/schema change → SDK unaffected.

## Risks / open questions
- **No live IdP** here → verify offline (signed JWTs + a local JWKS); a live round-trip is a documented seam.
- **Fastify leakage** → the provider ships in the Fastify-free core; `jose` has no Fastify (verified in dist).
- **Claim conventions** vary by IdP → roles/tenant claim names are configurable with documented defaults.
