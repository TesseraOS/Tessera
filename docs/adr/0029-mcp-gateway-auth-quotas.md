# ADR-0029: MCP gateway — reuse the auth model (type-only), per-principal quotas, a shared RATE_LIMITED code

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** mcp, auth, authz, rbac, quotas, rate-limiting, gateway

## Context

FR-36 requires the MCP surface to **broker multiple agents/clients with auth + quotas**. F-025
(ADR-0028) already built the authn/authz control plane for REST: an `AuthProvider` port, an RBAC
permission catalog, `AuthContext`, and scoped tokens — all **transport-agnostic** (only the Fastify
`plugin.ts` is HTTP-specific). The MCP server (ADR-0017) wraps the **same** domain services as REST via
a **type-only** `ApiServices` import, deliberately keeping **Fastify out of the MCP runtime** (F-012).
MCP-over-stdio is 1:1; "brokering multiple clients" is realized when the server is fronted over a
multi-client transport (HTTP), where each request carries its own credential.

The decision is how MCP reuses the REST auth model without regressing the no-Fastify invariant, how
quotas are modeled, and how a quota denial is represented in the shared error envelope.

## Decision

**Add an injected gateway to `buildMcpServer` that reuses the F-025 auth model type-only, meters
per-principal quotas with an MCP-owned port, and surfaces quota denials via a new shared error code.
Default off — the tools behave exactly as before.**

- **Reuse the auth model, type-only.** `@tessera/mcp` imports `AuthProvider` / `AuthContext` /
  `AuthInput` / `Permission` from `@tessera/api` **as types**. The gateway needs only
  `ctx.permissions.has(perm)` — no runtime auth import — so **no Fastify enters the MCP runtime**.
  Providers (local/token/OIDC) are constructed at the composition root, which already depends on
  `@tessera/api` at runtime.
- **`createMcpGateway({ auth, quota?, resolveCredential? })`** returns a `guard(tool, extra)` that:
  authenticate (→ `AuthContext`, throws `UnauthorizedError`) → authorize the tool's required
  `Permission` (`TOOL_PERMISSIONS`; throws `ForbiddenError`) → meter the principal (throws
  `RateLimitedError`). `buildMcpServer(services, { gateway? })` wraps each tool with the guard; **with
  no gateway the five tools are unguarded** (unchanged). Errors flow through the existing masked
  envelope (`toEnvelope`) — `UNAUTHORIZED` / `FORBIDDEN` / `RATE_LIMITED` are 4xx-safe and surfaced.
- **Quota port, MCP-owned.** `QuotaLimiter` + `createInMemoryQuotaLimiter` (fixed-window, injected
  clock, independent per-principal buckets). Distributed/persistent limiters, token-bucket/sliding
  windows, and per-tool weights are seams.
- **Transport-agnostic credential.** `resolveCredential(extra)` reads the MCP SDK `authInfo` (or the
  `Authorization` header) by default; injectable. Over stdio it's one identity; the multi-client HTTP
  transport + auth middleware that populates `authInfo` is the deployment seam.
- **Shared `RATE_LIMITED` code.** Added to `@tessera/core` (`ErrorCode` + `RateLimitedError`), mapped to
  **429** by the REST envelope (`statusForCode`/`codeForStatus`/`errorCodeSchema`). One 429-equivalent
  serves both MCP quotas and future REST rate-limiting, instead of overloading `FORBIDDEN` (403).

## Consequences

### Positive
- One identity + RBAC model across REST and MCP; the MCP gateway is a thin, injected wrapper.
- The MCP runtime stays **Fastify-free** (type-only reuse), preserving the F-012 invariant.
- **Back-compatible:** default `buildMcpServer(services)` is unchanged; enforcement is opt-in.
- A proper `RATE_LIMITED`/429 exists for both surfaces (DRY), added additively and compiler-guided
  (the exhaustive `statusForCode` switch forced the case).

### Negative / Costs
- The in-memory quota limiter is per-process, non-durable — a distributed limiter is a seam.
- Per-client credentials require a multi-client transport (HTTP); stdio carries one identity. The
  gateway is proven over `InMemoryTransport` with an injected credential resolver.
- `@tessera/core` grew a public error code — a small, reviewed additive change (E-006).

### Neutral / Follow-ups
- HTTP/streamable transport + auth middleware, a persistent/distributed quota store, quota headers,
  and composition-root wiring (config/server → construct the gateway from a profile) are follow-ups.

## Alternatives considered

- **Move the auth model to a shared package (or `@tessera/core`).** Cleaner sharing, but a larger
  refactor; the architecture places `AuthProvider` in `@tessera/api`, and type-only reuse already gives
  DRY without pulling Fastify. Revisit if a third surface needs it.
- **Represent quota denial with an existing code (FORBIDDEN/CONFLICT).** Rejected: semantically wrong
  (429 ≠ 403) and confusing to clients; a dedicated `RATE_LIMITED` is correct and reusable.
- **Enforce auth/quota outside the app (a proxy).** Rejected: per-tool permission knowledge lives with
  the tools; an in-process gateway is testable via a real MCP client over `InMemoryTransport`.

## References

- FR-36; [ADR-0017](0017-mcp-server-surface.md) (MCP surface, type-only services),
  [ADR-0028](0028-api-auth-tenancy-rbac.md) (auth/RBAC model reused here). Effects `E-018` (auth
  contract, MCP consumer), `E-006` (core `RATE_LIMITED`), `E-003` (guarded tools; 429 envelope).
