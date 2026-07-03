# ADR-0030: Auth composition-root wiring — a Fastify-free `@tessera/api/auth` subpath + persistent SQLite token store

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** config, auth, deployment, composition-root, packaging, mcp

## Context

F-025 (REST auth/RBAC) and F-026 (MCP gateway) shipped the auth **capability** proven by tests, but the
composition root did not yet **select** a provider from config or make token grants durable. Making it
usable end-to-end hits a packaging constraint: `apps/server` boots the **MCP** process **through
`@tessera/config`**, and config imports `@tessera/api` **type-only** precisely so the MCP runtime never
pulls Fastify (the F-012 invariant). Constructing the auth providers requires `@tessera/api` **runtime**
code — importing the package barrel would drag Fastify into the MCP process.

The auth model, `AuthProvider`/`TokenStore` ports, and their adapters are **transport-agnostic** — only
`auth/plugin.ts` (the Fastify enforcement hook) depends on Fastify.

## Decision

**Expose a Fastify-free subpath, wire auth selection through the config Runtime, and back token mode with
a persistent SQLite store. Default `none` keeps today's zero-auth behavior.**

- **`@tessera/api/auth` subpath export.** A new `auth/core.ts` barrel (model + providers + token-store,
  **excluding** `plugin.ts`) is published as `@tessera/api/auth` (package `exports`). Non-HTTP consumers
  (`@tessera/config`; type-only, the MCP gateway) construct auth **without Fastify**. The main
  `@tessera/api` entry still carries the full barrel (incl. the plugin) for the REST server.
- **Config `auth` section.** `configSchema` gains `auth { mode: none|token, tenant, quota
  {enabled,limit,windowMs} }` with `TESSERA_AUTH_*` env mapping; default `none`.
- **Persistent token store.** `createSqliteTokenStore(db)` (in `@tessera/config`) implements the
  `@tessera/api` `TokenStore` port over the storage **Drizzle** handle (`api_tokens` table), sharing the
  in-memory adapter's hashing scheme via the extracted `hashApiTokenSecret`/`newApiTokenSecret` helpers —
  so issued tokens **survive restarts**. Config gains a `drizzle-orm` dependency (it now owns a Drizzle
  adapter directly).
- **Runtime + server wiring.** `createLocalRuntime` builds `Runtime.auth = { provider, tokenStore? }` from
  `config.auth.mode` (via the subpath). `startApiServer` passes `runtime.auth.provider` to `buildServer`;
  `startMcpStdio` gains a `{ gateway? }` passthrough and `startMcpServer` builds the gateway
  (`createMcpGateway` + optional `createInMemoryQuotaLimiter`) — all Fastify-free. A `tessera-token` bin
  issues a scoped token (secret printed once) so token mode is usable.

## Consequences

### Positive
- Auth + MCP quotas are now **operator-configurable and wired end-to-end**, not just test-proven.
- The **MCP runtime stays Fastify-free** — verified: config's only runtime `@tessera/api*` import is the
  `/auth` subpath, whose module graph contains no Fastify.
- Token grants are **durable** (SQLite), and one `tessera-token` command mints the first token.
- Fully back-compatible: default `none` → the zero-auth Local provider; existing server/e2e unchanged.

### Negative / Costs
- `@tessera/api` now has a second public entry point (`./auth`) to keep coherent with the main barrel.
- `@tessera/config` gains a `drizzle-orm` dependency (it authors a Drizzle adapter now).
- Quotas remain **in-memory** (per-process) — correct for single-instance; a distributed store is a seam.

### Neutral / Follow-ups
- OIDC provider selection, a distributed/persistent quota store, and data-plane per-tenant row-scoping
  remain documented seams. The `auth` config section is the extension point for an `oidc` mode.

## Alternatives considered

- **Import `@tessera/api` runtime from config.** Rejected: pulls Fastify into the MCP process (F-012
  regression).
- **Move the auth model to a new `@tessera/auth` package.** Cleaner long-term, but a larger refactor;
  the subpath export achieves Fastify-free reuse now without moving F-025's code. Revisit if a third
  non-HTTP consumer appears.
- **Put the SQLite token store in `@tessera/api` or `@tessera/storage`.** Rejected: api would gain a
  storage dep; storage would depend on the api `TokenStore` port (wrong direction). Config is the
  composition root that already wires storage + api.

## References

- FR-52, FR-54, NFR-2, FR-36; [ADR-0018](0018-config-loader-and-local-profile.md) (config/profiles),
  [ADR-0028](0028-api-auth-tenancy-rbac.md) (auth model), [ADR-0029](0029-mcp-gateway-auth-quotas.md)
  (MCP gateway). Effects `E-014` (config composition) + `E-018` (auth contract / composition consumer).
