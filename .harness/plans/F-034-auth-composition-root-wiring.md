# Plan: F-034 — Auth composition-root wiring + persistent SQLite token store

- **Feature:** F-034 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-52, FR-54, NFR-2, FR-36
- **ADRs:** **0030 (new — config-driven auth wiring; Fastify-free `@tessera/api/auth` subpath; persistent SQLite token store)**; relates to ADR-0018 (config/profiles), 0028 (auth), 0029 (MCP gateway)
- **Package:** `@tessera/config` (+ `@tessera/api` subpath, `@tessera/mcp`, `apps/server`) · **Author:** Claude · **Date:** 2026-07-03
- **Verification:** typecheck · lint · test (keep format + build green)

## Intent
Make the F-025/F-026 auth capability **usable end-to-end**: select the `AuthProvider` (REST) + MCP
`gateway` from **config/env**, back them with a **persistent** token store, and wire both into the
runnable server — while the **default stays zero-auth** and the **MCP runtime stays Fastify-free**.

## Key constraint & solution
`apps/server` boots the MCP process **through `@tessera/config`**; config imports `@tessera/api`
**type-only** today, so the MCP runtime has no Fastify. Constructing auth providers pulls
`@tessera/api` runtime — which would drag Fastify into the MCP process. **Solution:** a Fastify-free
**subpath export `@tessera/api/auth`** (auth model + providers + token store; **excludes** the Fastify
`plugin.ts`). Config builds `runtime.auth` from that subpath; the MCP bin builds the gateway from
`runtime.auth.provider` + the Fastify-free `@tessera/mcp` helpers. No Fastify enters the MCP runtime.

## Approach / increments (each keeps gates green)
1. **`@tessera/api`:** extract `hashApiTokenSecret`/`newApiTokenSecret` from the in-memory token store
   (DRY, so the SQLite adapter shares the scheme); add `src/auth/core.ts` (Fastify-free barrel: model +
   provider + token-store) and a `"./auth"` entry in `package.json#exports`. `index.ts`/`auth/index.ts`
   unchanged in surface.
2. **`@tessera/config`:** `schema.ts` `auth` section (`mode: none|token`, `tenant`, `quota
   {enabled,limit,windowMs}`, default `none`) + `load.ts` `TESSERA_AUTH_*` mapping + merge; new
   `auth/sqlite-token-store.ts` (`createSqliteTokenStore(db)` implementing the api `TokenStore` port over
   the Drizzle handle — `api_tokens` table, hashed at rest, revoke, list); `runtime.ts` `RuntimeAuth`
   (`{ provider, tokenStore? }`) added to `Runtime`; `profiles/local.ts` builds `auth` from
   `@tessera/api/auth` by `config.auth.mode`.
3. **`@tessera/mcp`:** `startMcpStdio(services, options?: { gateway? })` passes the gateway to
   `buildMcpServer` (additive).
4. **`apps/server`:** `api.ts` passes `runtime.auth.provider` to `buildServer`; `mcp.ts` builds the
   gateway (`createMcpGateway` + optional `createInMemoryQuotaLimiter` from `config.auth.quota`) and
   passes it to `startMcpStdio`; new `bin/token.ts` (`tessera-token`) issues a token (secret printed
   once) so token mode is usable; `package.json#bin`.

## Files to touch
- `apps/api/src/auth/token-store.ts` — export `hashApiTokenSecret`/`newApiTokenSecret`; `core.ts` (new);
  `apps/api/package.json` — `exports["./auth"]`.
- `packages/config/src/{schema.ts,load.ts,runtime.ts,index.ts}`, `packages/config/src/auth/sqlite-token-store.ts`
  (new), `packages/config/src/profiles/local.ts`.
- `apps/mcp/src/stdio.ts`; `apps/server/src/{api.ts,mcp.ts,bin/token.ts}` + `apps/server/package.json`.
- Tests: `packages/config/src/auth/sqlite-token-store.test.ts`, `apps/server/src/api.test.ts` (auth-mode).
- `docs/adr/0030-*.md` + index; `.harness/state/{feature_list,effects,progress}`, memory.

## Anticipated effects
- **E-014** (config composition root): `Runtime` gains `auth`; the Local profile selects the provider +
  token store by config — the new wiring seam realized.
- **E-018** (auth contract): the composition-root **consumer** of the auth ports is realized (providers +
  SQLite token store selected by config; gateway wired into the MCP bin). The Fastify-free `@tessera/api/auth`
  subpath is the new import surface for non-Fastify consumers (config, and type-only for MCP).

## Test plan
- **Unit:** `createSqliteTokenStore` — issue→verify (hashed at rest), revoke→null, list-by-tenant, unknown→null.
- **Integration (server):** boot `startApiServer` with `config.auth.mode='token'` → `/v1/search` 401 without
  a token; issue via `runtime.auth.tokenStore` → 200 with `Authorization: Bearer`. Default (none) build stays 200.
- **Regression:** existing server/api/mcp tests unchanged (default none).

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` ·
`pnpm build`. **Plus** confirm the MCP runtime stays Fastify-free (config imports `@tessera/api/auth`,
not the main barrel, at runtime).

## Risks / open questions
- **Fastify in the MCP runtime** — mitigated by the `@tessera/api/auth` subpath (excludes `plugin.ts`);
  verify config's only runtime `@tessera/api*` import is the subpath.
- **Quota persistence** — the in-memory limiter is per-process; a distributed/persistent quota store is a
  documented seam (multi-instance concern), unlike the token store where grant durability matters.
- **Subpath resolution** — NodeNext honors `exports`; the subpath resolves to `dist/auth/core` (api must be
  built first — turbo ordering handles it).
