# Plan: F-045 Dashboard authentication & session + adopt @tessera/sdk (closes ADR-0022)

- **Feature:** F-045 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-64 (dashboard auth/session), NFR-2 (secure auth) — [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** apps/web (`@tessera/web`); enablers in `@tessera/api` (`GET /v1/me`) and `@tessera/sdk`
- **Author:** Claude (orchestrator) · **Date:** 2026-07-14

## Intent
Give the dashboard a real auth/session so it works safely against a token-mode (or OIDC, seam)
API while keeping zero-auth Local mode byte-for-byte unchanged; and finish ADR-0022 by moving the
data path from the interim `lib/api` onto the generated `@tessera/sdk`. Credentials live in an
**httpOnly cookie behind a same-origin Next proxy** — never in `localStorage` or client JS.

## Approach
The dashboard stops calling the API cross-origin. Instead:

1. **Same-origin proxy** (`app/api/tessera/[...path]/route.ts`) forwards `/api/tessera/<path>` →
   `TESSERA_API_URL/<path>` (server-only env), injecting `Authorization: Bearer <token>` from the
   httpOnly `tessera_session` cookie when present. SSRF-safe (fixed base, reject `..`/scheme in
   segments), forwards only safe headers + body, returns the upstream status/body verbatim (so the
   `{error}` envelope + status flow through). In zero-auth mode there is no cookie → no bearer →
   the API's zero-auth provider grants full access (unchanged behavior).
2. **Session route** (`app/api/auth/session/route.ts`) — the only cookie writer: `POST {token}`
   validates by calling `TESSERA_API_URL/v1/me` with the bearer (200 ⇒ set httpOnly/SameSite=Lax/
   Secure-in-prod cookie + return identity; 401 ⇒ reject); `DELETE` clears it. Reading identity is
   via the proxy (`me()`), so there is one source of truth.
3. **`GET /v1/me`** (new API route) — projects the resolved `AuthContext` to
   `{ principal: {id, kind, roles, displayName?}, tenantId, permissions }`. Authenticated, no
   special permission (any principal may see itself). Zero-auth ⇒ the local principal; token ⇒ the
   token principal; missing token under a non-none provider ⇒ 401. Enables identity display + token
   validation + mode discovery.
4. **SDK adoption** — `apps/web` adds `@tessera/sdk` (workspace) and `lib/api` becomes a thin
   adapter over `createTesseraClient({ baseUrl: '/api/tessera' })` (same-origin; auth handled by the
   proxy). The SDK gains `me()`, `getPlans()`, `getHealth()`, `getReady()` (all already in the
   OpenAPI paths; `getReady` treats 503 as data). The TanStack Query **hook surface is unchanged**,
   so every existing view keeps working with a localized swap (ADR-0022's promised drop-in).
5. **Session UX** — a `SessionProvider` (client) runs a React Query identity fetch (`me()` via the
   proxy). `kind==='local'` ⇒ Local mode (NavUser unchanged, no sign-out, no sign-in screen);
   `kind==='token'|'oidc'` ⇒ show identity + tenant + sign-out. A **401** from any request (not on
   `/signin`) redirects to `/signin?return=<path>` (mode discovery: token-mode-not-signed-in). Other
   failures fall back to Local (so nothing breaks offline). `app/signin/page.tsx` = a token-entry
   form → `POST /api/auth/session` → on success invalidate identity + return to `?return`. `AppShell`
   renders bare (no chrome) on `/signin`.

## Files to touch
- **API:** `apps/api/src/schemas/identity.ts` (new, `meResponseSchema`), `routes/v1/me.ts` (new),
  `routes/v1/index.ts` (+register), `src/index.ts` (+export); `tests/e2e/me.e2e.test.ts` (new).
- **SDK:** `scripts/generate.mjs` re-run → `openapi.json` + `src/generated/schema.ts` regenerated
  (adds `/v1/me`); `src/client.ts` (+`me`/`getPlans`/`getHealth`/`getReady`, interface + types);
  `tests/integration/sdk.test.ts` (+cases).
- **Web (auth):** `app/api/tessera/[...path]/route.ts`, `app/api/auth/session/route.ts`,
  `lib/auth/session.ts` (types), `lib/auth/use-session.tsx` (provider+hook+signIn/out),
  `app/signin/page.tsx`, `components/nav-user.tsx` (identity/sign-out), `components/app-shell.tsx`
  (bare on `/signin`), `app/providers.tsx` (SessionProvider + 401→redirect via QueryCache),
  `.env.example` (`TESSERA_API_URL`).
- **Web (SDK swap):** `lib/api/client.ts` (internals → SDK over `/api/tessera`; keep `api` surface),
  add `@tessera/sdk` to `package.json`; `lib/api/client.test.ts` updated to the new boundary.
- **Web (tests):** `tests/e2e/support/test.ts` (fixture auto-mocking `**/v1/me` → Local so view
  specs don't redirect) + switch the 9 view specs' import; `tests/e2e/support/token-api-server.mjs`
  (real token-mode `@tessera/api` via `@tessera/config` `createLocalRuntime` `:memory:`+fake
  embeddings, issues a token, exposes it on a test-only route); `tests/e2e/auth.spec.ts` (token
  mode, real server); `playwright.config.ts` (+second webServer, `TESSERA_API_URL`).
- **Docs:** **ADR-0048** (credential handling: httpOnly-cookie same-origin proxy; closes ADR-0022);
  amend ADR-0022 status → superseded-by F-045; `apps/web/AGENTS.md`/README note if needed.

## Anticipated effects
- **E-003** (REST/SDK/dashboard contract): new `GET /v1/me` route ⇒ regenerate OpenAPI + SDK; the
  dashboard now consumes the **generated SDK** through a same-origin proxy (ADR-0022 closed).
- **E-018** (auth control plane): `/v1/me` projects `AuthContext`; the dashboard becomes an auth
  client (token session), mode-discovers via 401.
- **E-004** (design tokens): new sign-in + identity UI must be tokens-only, themed, WCAG AA.
- New effect likely: the web auth/session + proxy seam (record during effect-trace).

## Test plan
- **API unit/e2e:** `/v1/me` returns the local principal (zero-auth), the token principal (token),
  401 without a token (token mode). **SDK integration:** `me`/`getPlans`/`getHealth`/`getReady`
  (incl. 503-as-data) round-trip against the real in-memory API.
- **Web unit (vitest/RTL):** the proxy path builder (SSRF guards), session sign-in/out client,
  `useSession` states, NavUser identity vs Local, sign-in form validation.
- **Web e2e (Playwright):** existing view specs stay green (identity auto-mocked Local, no
  redirect); **`auth.spec.ts` against a real token-mode server**: unauthenticated → redirected to
  `/signin`; invalid token → error; valid token → app + identity shown; sign-out → `/signin`. WCAG
  AA (axe) on `/signin` + the authed shell.

## Verification
`node scripts/verify-state.mjs` · `pnpm -w typecheck` · `pnpm -w lint` · `pnpm -w format` ·
`pnpm -w test` · `pnpm -w test:e2e` · `pnpm -w build`. Capture counts as evidence; browser-verify
the sign-in flow + identity in both modes (screenshots) per the frontend quality bar.

## Risks / open questions
- **Static-export?** No — Next 16 here runs a server (route handlers + `cookies()` available).
- **CSRF:** cookie is `SameSite=Lax` + same-origin proxy; state-changing calls are same-origin.
  A double-submit token is a documented follow-up if needed.
- **e2e token server** adds `@tessera/api`/`@tessera/config` as web **devDeps** (test-only; not
  bundled by Next). Uses `:memory:` + fake embeddings so it is offline/CI-safe.
- **Decision recorded in ADR-0048** (acceptance requires it): httpOnly-cookie same-origin proxy
  over token-in-JS/localStorage. No new golden-rule deviations.
