---
id: reuse-cross-surface-contract-type-only-to-avoid-runtime-coupling
kind: lesson
title: Share a contract across surfaces type-only; inject the runtime at the composition root
links:
  - apps/mcp/src/gateway.ts
  - apps/mcp/src/server.ts
  - apps/api/src/auth
  - docs/adr/0029-mcp-gateway-auth-quotas.md
confidence: 0.9
created: 2026-07-03
---

**What happened:** F-026 (MCP gateway) needed the F-025 auth/RBAC model that lives in `@tessera/api`.
Importing its runtime (`createLocalAuthProvider`, `hasPermission`, …) would have loaded `@tessera/api`'s
index → **Fastify** into the MCP runtime, regressing the deliberate "no Fastify in MCP" invariant (F-012,
which imports `ApiServices` **type-only**). The fix: `@tessera/mcp` imports the auth **types** only
(`AuthProvider`/`AuthContext`/`AuthInput`/`Permission`) and the gateway needs nothing more than the data
(`ctx.permissions.has(perm)`); the concrete providers are constructed at the **composition root** (the
server/config, which already depends on `@tessera/api` at runtime) and **injected**, exactly like
`ApiServices`.

**How to apply:**

- **Type-only reuse for cross-package contracts.** When package B needs a contract defined in package A
  but not A's heavy runtime, `import type` the interfaces/enums and design B to consume the *data*, not
  A's constructors. Node ESM loads whatever a runtime import's module graph pulls — a single runtime
  import of A's barrel drags all of A's transitive deps in.
- **Inject the runtime at the composition root.** The place that already depends on A at runtime builds
  the concrete instances and passes them in (mirror the existing `buildX(services, options)` seam). Keep
  the new capability **default-off** so existing callers are unchanged.
- **Verify the invariant, don't assume it.** "No Fastify in the MCP runtime" holds only if `src/` imports
  from the other package stay `type`-only; tests may use the real runtime (the test process loading it is
  harmless).
- **If a third surface needs the same contract,** promote it to a shared, dependency-light package rather
  than repeating type-only reuse — but don't pre-refactor for a second consumer.
- **Shared error codes go in `@tessera/core` additively.** A new `RATE_LIMITED` (→429) served both the MCP
  quota and future REST rate-limiting; the exhaustive `statusForCode` switch (no `default`) **forced** the
  new case at typecheck — lean on that instead of a catch-all.

Pairs with [[mcp-twin-surface-type-only-and-inmemory-e2e]] (the same type-only ApiServices pattern) and
[[auth-control-plane-default-none-additive]] (the injected-port, default-off design). See [[harness-model]].
