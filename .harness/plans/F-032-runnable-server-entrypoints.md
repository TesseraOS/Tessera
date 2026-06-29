# Plan: F-032 Runnable server entrypoints (REST + MCP) wiring the Local profile

- **Feature:** F-032 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-37, FR-35, FR-50 — `docs/PRD.md`
- **Service / package:** `@tessera/server` (`apps/server`)
- **Author:** Claude (Opus 4.8) · **Date:** 2026-06-29

## Intent
The thin runnable glue explicitly deferred from F-011/F-012/F-015 (ADR-0018): boot the Local profile
(`createLocalRuntime(loadConfig())`) and serve the two surfaces — REST over HTTP, MCP over stdio.
"Done" = `node dist/bin/api.js` serves `/v1`, `node dist/bin/mcp.js` serves the tools, with graceful
shutdown, and the dependency graph stays acyclic.

## Approach
New `apps/server` (`@tessera/server`) depending on `@tessera/config` + `@tessera/api` + `@tessera/mcp`,
**depended on by nothing** — so the `api↔config` cycle the type-only `ApiServices` import avoids is
never reintroduced. Thin, testable boot functions + executable bins:
- `createServerRuntime(opts)` — `loadConfig` (env + overrides) → `createLocalRuntime` (shared).
- `startApiServer(opts)` — build the F-011 server over `runtime.services`, `listen`, return a handle
  whose `close()` stops the server then the runtime.
- `startMcpServer(opts)` — `startMcpStdio(runtime.services)` (the connected server type is derived
  via `Awaited<ReturnType<typeof startMcpStdio>>`, so no direct SDK dependency).
- `bin/api.ts` / `bin/mcp.ts` — `#!/usr/bin/env node` executables (declared in `package.json#bin` as
  `tessera-api` / `tessera-mcp`) that run `main()` + `SIGINT`/`SIGTERM` graceful shutdown. The MCP bin
  logs only to stderr (stdout is the protocol).

## Files to touch
- `apps/server/{package.json,tsconfig.json,README.md}`.
- `apps/server/src/{bootstrap,api,mcp,index}.ts`, `apps/server/src/bin/{api,mcp}.ts`.
- Tests: `apps/server/src/api.test.ts` (real ephemeral-port boot + HTTP), `src/mcp.test.ts`.
- State: `feature_list.json` (+F-032), `progress.md`. (Effect **E-014** already names these bins.)

## Anticipated effects
- Realizes the "runnable REST/MCP process bins that boot from a Runtime" consumer already recorded on
  effect **E-014**; consumes (no change to) the config/api/mcp contracts.

## Test plan
- **REST:** `startApiServer({ port: 0, config: { …:memory:…, embeddings: fake } })` then real `fetch`
  of `/health`, `/ready`, `/v1/openapi.json` — proves the full boot+serve path, offline.
- **MCP:** `createServerRuntime` + `buildMcpServer(runtime.services)` compose; a wired service call
  works. (The stdio connect itself is F-012-tested glue.)

## Verification
`state · typecheck · lint · format:check · test · build`. No e2e gate (tests run under `test`).

## Risks / open questions
- **Acyclic graph:** the bins must live outside `api`/`config`; the connected-server type is derived
  through `@tessera/mcp` (no phantom SDK dep). Both enforced.
- Default `transformers` provider downloads a model on first real boot (tests use `fake`).
- No open `OQ*`.
