# Plan: F-026 — MCP gateway (multi-client auth + quotas)

- **Feature:** F-026 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-36
- **ADRs:** **0029 (new — MCP gateway: reuse the auth model type-only, per-principal quotas, RATE_LIMITED code)**; relates to ADR-0017 (MCP surface), 0028 (auth/RBAC)
- **Package:** `@tessera/mcp` (extend) + a small `@tessera/core` addition · **Author:** Claude · **Date:** 2026-07-03
- **Verification:** typecheck · lint · test · e2e (keep format + build green)

## Intent
Let the MCP surface **broker multiple agent clients with authentication + RBAC + quotas** (FR-36),
reusing the F-025 auth model so REST and MCP share one identity/permission contract. "Done" = each MCP
tool is gated by the calling principal's permission and a per-principal quota, denied cleanly through the
existing masked envelope; and with **no gateway configured the five tools behave exactly as today**.

## Scope (acceptance is the contract — nothing more)
- **In:**
  - `@tessera/core`: a new `RATE_LIMITED` error code + `RateLimitedError` (shared; → 429 at REST). Small,
    additive, compiler-guided.
  - `@tessera/mcp`: a `QuotaLimiter` port + `createInMemoryQuotaLimiter` (fixed-window, injected clock);
    a `createMcpGateway({ auth, quota, resolveCredential })` guard (authenticate → authorize by required
    `Permission` → meter per principal); `buildMcpServer(services, { gateway })` wraps each tool
    (declaring its required permission) with the guard; default = no gateway (unchanged behavior).
  - Reuse the F-025 auth **types** (`AuthProvider`/`AuthContext`/`AuthInput`/`Permission`) **type-only**
    from `@tessera/api` — **no Fastify in the MCP runtime** (the F-012 invariant holds).
- **Deliberately out (documented seams):**
  - The **HTTP/streamable transport** that carries per-client credentials (the gateway is transport-
    agnostic; `resolveCredential(extra)` reads MCP `authInfo` by default). stdio is one identity per
    process; the multi-client HTTP transport + auth middleware is the deployment seam (like F-015 wires
    the process). Proven over `InMemoryTransport` with an injected credential resolver.
  - Composition-root wiring (config/server → construct the gateway from a profile) — a one-line seam,
    capability proven by tests injecting a real token `AuthProvider` + limiter.
  - Distributed/persistent quota store, token-bucket/sliding-window, per-tool weights, quota headers.

## Approach — an injected gateway guard, mirroring the injected `ApiServices`
`buildMcpServer` already takes services **type-only**; add an optional `gateway`. The gateway is a pure
guard `guard(toolName, requiredPermission, extra) → Promise<AuthContext>`:
1. `credential = resolveCredential(extra)` (default: `extra.authInfo` → Bearer),
2. `ctx = await auth.authenticate(credential)` (throws `UnauthorizedError` on missing/invalid),
3. `if (!ctx.permissions.has(requiredPermission)) throw ForbiddenError` (RBAC, reuse F-025 catalog),
4. `quota.consume(ctx.principal.id)` → over limit throws `RateLimitedError`.
Each tool callback becomes `(args, extra) => runTool(async () => { await guard(name, perm, extra); … })`,
so failures flow through the **existing** `toEnvelope` masking (UNAUTHORIZED/FORBIDDEN/RATE_LIMITED are
4xx-safe → surfaced; INTERNAL masked). No gateway ⇒ no guard ⇒ current behavior.

Required permissions: `search`→`search:read`, `compile_context`/`explain`→`compile:read`,
`get_effects`→`effects:read`, `capture_memory`→`memory:write`.

### Increments (each keeps gates green)
1. `@tessera/core` RATE_LIMITED + RateLimitedError; fix the api envelope switch + the two mirror enums.
2. `@tessera/mcp` QuotaLimiter port + in-memory adapter + unit tests.
3. `createMcpGateway` guard + `buildMcpServer` gateway option + tool wiring; unit + e2e; back-compat.
4. ADR-0029 + effects + docs + record.

## Files to touch
- `packages/core/src/errors.ts` — add `RATE_LIMITED` to `ErrorCode` + `RateLimitedError`.
- `apps/api/src/errors/envelope.ts` — `statusForCode` `RATE_LIMITED`→429; `codeForStatus` 429→`RATE_LIMITED`.
- `apps/api/src/schemas/common.ts` — add `RATE_LIMITED` to `errorCodeSchema` (envelope serialization).
- `apps/web/lib/api/types.ts` — add `RATE_LIMITED` to the web `ErrorCode` mirror.
- `apps/mcp/src/quota.ts` — **new**: `QuotaLimiter` port + `createInMemoryQuotaLimiter`.
- `apps/mcp/src/gateway.ts` — **new**: `McpGateway`, `createMcpGateway`, `ToolPermission` map, guard.
- `apps/mcp/src/server.ts` — `buildMcpServer(services, options?)`; wrap tools with the guard when present.
- `apps/mcp/src/index.ts` — export the gateway + quota surface.
- `apps/mcp/src/quota.test.ts`, `apps/mcp/src/gateway.test.ts` — **new** unit tests.
- `apps/mcp/tests/e2e/gateway.e2e.test.ts` — **new** real-client e2e.
- `docs/adr/0029-*.md` + ADR index; `.harness/state/{feature_list,effects,progress}`, memory.

## Anticipated effects
- **E-018** (auth contract): the MCP gateway becomes a **new consumer** of the auth model (type-only) —
  add it to the dependents; the permission catalog now also gates MCP tools.
- **E-006** (`@tessera/core` public API): additive `RATE_LIMITED`/`RateLimitedError` — review dependents
  (the api envelope + mirrors handle it; MCP `toEnvelope` passes it through).
- **E-003** (REST/MCP contracts): MCP tools now guarded (additive; input/output schemas unchanged); the
  REST envelope gains a 429 mapping. OpenAPI unchanged (no route change).

## Test plan
- **Unit (quota):** fixed-window allow/deny; window reset (injected clock); independent per principal.
- **Unit (gateway):** viewer principal → `capture_memory` denied FORBIDDEN, `search` allowed; missing
  credential → UNAUTHORIZED; quota exhaustion → RATE_LIMITED; different principals metered independently.
- **E2E (real MCP client / InMemoryTransport):** gateway build with a token `AuthProvider` (fixed viewer
  credential) + low quota → `capture_memory` returns an error envelope FORBIDDEN; repeated `search`
  eventually RATE_LIMITED. **Back-compat:** default build (no gateway) → all five tools still succeed.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` ·
`pnpm test:e2e` · `pnpm build` — all workspace-wide green; capture counts.

## Risks / open questions
- **Fastify leakage into MCP.** Mitigation: import auth **types only** from `@tessera/api`; the gateway
  needs only `ctx.permissions.has()` (no runtime auth import). Keep `src/` type-only; tests may use the
  real providers.
- **Credential transport over InMemoryTransport.** `resolveCredential` is injectable; tests supply a
  fixed credential (realistic for stdio's single identity). HTTP multi-client transport is a seam.
- **Core error-code addition** ripples to the REST envelope + mirrors — additive and compiler-guided
  (the exhaustive `statusForCode` switch forces the 429 case). Recorded in ADR-0029.
