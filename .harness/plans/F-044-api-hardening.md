# Plan: F-044 API hardening — rate limiting, security headers, SSE auth, per-profile CORS, request-id

- **Feature:** F-044 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-1 (typed/validated API surface), NFR-2 (authn/z, secure defaults) — from [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** apps/api (`@tessera/api`), with config wiring in `@tessera/config`, process wiring in `apps/server`, and a trace-annotation helper in `@tessera/observability`
- **Author:** Claude (orchestrator) · **Date:** 2026-07-14

## Intent
Harden the HTTP surface so a hosted/self-host deployment is safe by default: per-principal
(fallback per-IP) **rate limiting** on `/v1`, **security headers** on every response, the
**SSE** stream authenticated like every other route, a **per-profile CORS allowlist** replacing
the blanket registration, and **request-id correlation** (accept inbound, generate, echo,
thread into logs + traces). Local behavior stays zero-friction (loopback CORS permissive,
rate limiting opt-in), so nothing existing breaks.

## Approach
All additive. Reuse existing seams; no domain/schema (E-003) shape change.

1. **Security headers** (default on) — new `apps/api/src/security/headers.ts`: a pure
   `securityHeaders(opts)` → header map (`x-content-type-options: nosniff`, CSP
   `default-src 'none'; frame-ancestors 'none'`, `x-frame-options: DENY`,
   `referrer-policy: no-referrer`, and `strict-transport-security` **only when `hsts` (TLS)
   is enabled**) + `registerSecurityHeaders(app, opts)` (an `onRequest` hook so the headers
   ride every response incl. errors; the SSE writeHead reuses the same map). **Explicit hooks,
   not `@fastify/helmet`** — the sanctioned non-deviating option (no new dep; the API serves
   JSON only, no Swagger UI, so a strict CSP is safe). OpenAPI JSON keeps working.
2. **Request-id / correlation** — in `buildServer`, disable Fastify's raw header pickup
   (`requestIdHeader: false`) and use `genReqId` to **sanitize** an inbound `x-request-id`
   (`/^[\w.-]{1,128}$/`, else generate `req_<uuid>`) — prevents log/header injection. An
   `onRequest` hook echoes `x-request-id: <request.id>`. Fastify binds the id into every
   request log line (label `requestId`) automatically → logs. `@tessera/observability` gains
   `annotateRequestId(id)` (sets `tessera.request.id` on the active OTel span, no-op without
   one); `apps/server` calls it in an `onRequest` hook when observability is wired → traces.
3. **Rate limiting** — new `apps/api/src/security/rate-limit.ts`: a `RateLimiter` port +
   `createInMemoryRateLimiter` (fixed-window per key), **mirroring the F-026 QuotaLimiter
   pattern** (distributed store = documented seam) + `registerRateLimit(v1, opts)` — an
   `onRequest` hook registered **after** auth (so it can key on `request.authContext`
   principal, fallback per-IP), emitting IETF `RateLimit-Limit/Remaining/Reset` headers and,
   on denial, `Retry-After` + throwing `RateLimitedError` (→ 429 `{error}` envelope via the
   existing error handler). **Default disabled** (matches the F-026 quota precedent; local dev
   unthrottled, existing e2e unaffected); enabled per profile.
4. **CORS allowlist** — rewrite the `@fastify/cors` origin callback in `server.ts`: no Origin →
   allow (same-origin / server-to-server); an explicit `allowedOrigins` list → allow iff the
   origin matches; **no list (local default) → the current loopback-permissive behavior**.
   ADR-0035 app↔api cross-origin: the hosted app origin goes in the allowlist.
5. **Config + wiring** — add an `api` section to `@tessera/config` (`rateLimit {enabled,
   limit, windowMs}`, `cors {allowedOrigins}`, `security {hsts}`) with `TESSERA_API_*` env
   overrides + section merge; `apps/server` reads `runtime.config.api` and threads
   `security`, `rateLimit`, `cors` into `buildServer`, plus the observability request-id hook.

## Files to touch
- `apps/api/src/security/headers.ts` (new) — header map + `registerSecurityHeaders`.
- `apps/api/src/security/headers.test.ts` (new) — unit.
- `apps/api/src/security/rate-limit.ts` (new) — `RateLimiter` port + in-memory adapter + `registerRateLimit`.
- `apps/api/src/security/rate-limit.test.ts` (new) — unit (windowing, headers, key fn).
- `apps/api/src/server.ts` — request-id (`genReqId`/`requestIdHeader:false`/echo hook),
  `registerSecurityHeaders`, CORS allowlist, new `BuildServerOptions` (`security`,
  `rateLimit`, `cors`); pass rate-limit opts into `registerV1Routes`.
- `apps/api/src/routes/v1/index.ts` — accept + wire `registerRateLimit` after `registerAuth`.
- `apps/api/src/routes/v1/events.ts` — include the security header map in the SSE `writeHead`.
- `apps/api/src/index.ts` — export the new security types/functions.
- `packages/config/src/schema.ts` — `apiSchema` (rateLimit/cors/security) on `configSchema`.
- `packages/config/src/load.ts` — `TESSERA_API_*` env → `api` section + merge.
- `packages/config/src/schema.test.ts` — cover defaults + env of the new section.
- `apps/server/src/api.ts` — map `runtime.config.api` → buildServer opts; request-id span hook.
- `packages/observability/src/tracing.ts` (+ `index` already re-exports) — `annotateRequestId`.
- `apps/api/tests/e2e/hardening.e2e.test.ts` (new) — 429 path, headers present, SSE 401 under
  token mode, CORS allowlist honored, request-id echo.
- Docs: `apps/api/README.md` (security surface); ADR **only if** a design deviates (not planned).

## Anticipated effects
- **E-003** (REST/MCP contract): additive cross-cutting behavior (headers, 429, request-id,
  CORS) — **no route/schema shape change**, so OpenAPI/SDK/dashboard are unaffected; record
  the hardening as an additive touch.
- **E-014** (config schema + Local profile): new `api` config section + env → profile wiring.
- **E-018** (auth control plane): rate-limit keys on the resolved `AuthContext` principal;
  SSE now authenticated under a non-none provider.
- Consider a new effect node for the security middleware seam if warranted during effect-trace.

## Test plan
- **Unit:** `securityHeaders` (map incl. HSTS gating on/off); `createInMemoryRateLimiter`
  (fixed-window allow→deny→reset, per-key isolation, injected clock, header math); config
  schema (`api` defaults + `TESSERA_API_*` overrides + invalid rejection).
- **E2E (`app.inject` + a real socket for SSE):** rate limit → 429 `RATE_LIMITED` envelope +
  `RateLimit-*`/`Retry-After` headers on the Nth call; security headers present on a normal
  response and absent-HSTS by default; SSE returns **401** under token mode with no token and
  streams under a valid token; CORS allowlist: allowed origin reflected, disallowed origin
  rejected; inbound `x-request-id` echoed and a generated one when absent.

## Verification
Gates (workspace, per [verification protocol](../protocols/verification.md)):
`node scripts/verify-state.mjs` · `pnpm -w typecheck` · `pnpm -w lint` · `pnpm -w format` ·
`pnpm -w test` (api unit + config) · `pnpm -w test:e2e` (api e2e incl. the new hardening
suite) · `pnpm -w build`. Capture pass counts as evidence in `progress.md`.

## Risks / open questions
- **SSE auth**: the `/v1/events` route already sits inside the auth-guarded `/v1` scope
  (`onRequest` runs before the handler hijacks), so it *should* already 401 under token mode.
  The new e2e **locks** this; if it reveals a genuine bypass, fix within scope.
- **Header injection** via a hostile inbound `x-request-id` — mitigated by the sanitizing
  `genReqId` (charset + length cap).
- **Rate-limit default**: off by default (F-026 precedent + preserves existing e2e); enabled
  per profile. No ADR expected — security headers via explicit hooks and rate-limit-off-default
  are the documented non-deviating choices. If any turns out to deviate, write an ADR first.
