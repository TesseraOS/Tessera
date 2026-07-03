---
id: fastify-free-subpath-for-composition-root-reuse
kind: lesson
title: Expose a Fastify-free subpath so the composition root can build auth without dragging in Fastify
links:
  - apps/api/src/auth/core.ts
  - apps/api/package.json
  - packages/config/src/profiles/local.ts
  - docs/adr/0030-auth-composition-root-wiring.md
confidence: 0.9
created: 2026-07-03
---

**What happened:** F-034 wired the F-025 `AuthProvider` (in `@tessera/api`) into `@tessera/config` so the
runnable server could select it from config. But `apps/server` boots the **MCP** process **through
config**, and config deliberately imports `@tessera/api` **type-only** to keep the MCP runtime Fastify-free
(F-012). Building the providers needs `@tessera/api` **runtime** code — importing the package barrel
(`export { buildServer } …`) evaluates its module graph and loads **Fastify** into the MCP process. The auth
model/ports/adapters are transport-agnostic; only `auth/plugin.ts` imports Fastify.

**Fix:** a **Fastify-free subpath export** `@tessera/api/auth` — a new `auth/core.ts` barrel re-exporting
the model + providers + token store but **not** the Fastify `plugin.ts`, published via
`package.json#exports["./auth"]`. Config imports the runtime auth from `@tessera/api/auth`; the main entry
still carries the full barrel (incl. the plugin) for the REST server.

**How to apply:**

- **A package can have a heavy runtime and a light core.** When only part of a package pulls a big/native
  runtime (Fastify, a DB driver, a headless browser), expose the framework-free core as a **subpath
  export** so consumers that must stay light can import just that. `import type` erases at runtime, but a
  **value** import evaluates the whole target module's static-import graph — the barrel's cost comes along.
- **Split the barrel, keep the main entry a superset.** `core.ts` = transport-agnostic; `index.ts` =
  `export * from './core'` + the framework bits. No duplication, both entries stay coherent.
- **NodeNext honors `exports` subpaths** — build emits `dist/<sub>/core.{js,d.ts}`; point the `exports`
  map's `types`/`import` there. The upstream package must be built before the consumer typechecks (turbo
  ordering handles it).
- **Verify the invariant, don't assert it.** Grep the consumer's runtime imports (`grep "from '@pkg"` and
  confirm bare ones are `import type`), and grep the subpath's own module files for the forbidden runtime
  (`fastify`) — in src **and** the built output.
- **Put a cross-cutting adapter where the deps already point.** The persistent SQLite token store lives in
  `@tessera/config` (the composition root already deps storage + api); adding storage to `@tessera/api` or
  making `@tessera/storage` know the api `TokenStore` port would both be wrong-direction deps.

Pairs with [[reuse-cross-surface-contract-type-only-to-avoid-runtime-coupling]] (type-only reuse when you
need no runtime) and [[mcp-twin-surface-type-only-and-inmemory-e2e]]. See [[harness-model]].
