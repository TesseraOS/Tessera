# ADR-0048: Dashboard auth — httpOnly-cookie session behind a same-origin Next proxy

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** Project lead, Claude
- **Tags:** frontend, web, api, auth, security

## Context

F-045 gives the dashboard (`@tessera/web`) a real sign-in/session so it can drive a **token-mode**
(or OIDC — seam) Tessera API, while **zero-auth Local mode stays byte-for-byte unchanged**. It also
completes [ADR-0022](0022-interim-dashboard-data-client.md): move the data path off the interim
`apps/web/lib/api` and onto the generated **`@tessera/sdk`**.

Two questions had to be decided:

1. **Where does the API credential live in the browser?** The API authenticates with a `Bearer`
   token (F-025). The naive option is to hold that token in the SPA (memory/`localStorage`) and send
   it on every request. That exposes the long-lived token to any XSS and to `localStorage` snooping,
   and forces credentialed CORS across the app↔api subdomains (ADR-0035).
2. **How does the dashboard reach the API?** Directly cross-origin (as the interim client did, via
   `NEXT_PUBLIC_API_BASE_URL`), or through the web app's own origin?

## Decision

**Hold the token in an `httpOnly` cookie and never expose it to client JS. The browser talks only to
the web app's own origin through a Next.js proxy; the proxy attaches the token server-side.**

- **Same-origin proxy** — a catch-all Route Handler `app/api/tessera/[...path]/route.ts` forwards
  `/api/tessera/<path>` → `TESSERA_API_URL/<path>` (a **server-only** env var). It reads the
  `tessera_session` httpOnly cookie and, when present, sets `Authorization: Bearer <token>` on the
  upstream request. It is SSRF-safe (fixed upstream base; reject `..`/scheme in path segments),
  forwards only safe request headers + the body, and returns the upstream status + body **verbatim**
  so the `{ error: { code, message } }` envelope and status codes flow through unchanged.
- **Session route** `app/api/auth/session/route.ts` is the only cookie **writer**: `POST { token }`
  validates the token by calling `TESSERA_API_URL/v1/me` with it (200 ⇒ set the cookie
  `HttpOnly; SameSite=Lax; Path=/; Secure` (prod) and return the identity; 401 ⇒ reject); `DELETE`
  clears it. Reading identity is done through the proxy (`me()`), so there is a single source of
  truth.
- **`GET /v1/me`** (new, `@tessera/api`) projects the resolved `AuthContext` to
  `{ principal: { id, kind, roles, displayName? }, tenantId, permissions }`. It is authenticated but
  needs no special permission (a principal may always see itself). This backs identity display,
  token validation, and **mode discovery**: zero-auth ⇒ the local principal (kind `local`); token ⇒
  the token principal; missing token under a non-none provider ⇒ 401.
- **SDK adoption** — the dashboard's data path is `createTesseraClient({ baseUrl: '/api/tessera' })`;
  auth is entirely the proxy's job, so no token ever reaches the client. The interim `lib/api` keeps
  its hook-facing surface but delegates to the SDK (ADR-0022's promised drop-in). The SDK gains
  `me`/`getPlans`/`getHealth`/`getReady` (already in the OpenAPI paths).
- **Behavior split** — `kind === 'local'` renders the unchanged Local-mode account control (no
  sign-out, no sign-in screen); a `token`/`oidc` principal shows identity + tenant + sign-out. A
  **401** from any request (except on `/signin`) redirects to `/signin?return=<path>`; other
  failures fall back to Local so the app never hard-fails offline.

## Consequences

### Positive
- The API token is never in JS or `localStorage` — XSS cannot exfiltrate it (httpOnly).
- Same-origin browser traffic ⇒ no credentialed CORS to manage for the dashboard; `SameSite=Lax`
  gives baseline CSRF protection and the state-changing calls are same-origin.
- Zero-auth Local mode is unchanged (no cookie ⇒ no bearer ⇒ the zero-auth provider grants access);
  the same build serves both modes with no rebuild.
- ADR-0022 is closed: one generated, typed data path (`@tessera/sdk`).

### Negative / Costs
- The web app must run a server (Route Handlers) — it is no longer a pure static export. (It already
  ran under `next start`; no static-export was in use.)
- A small proxy hop is added to every API call (negligible; same host/process).

### Neutral / Follow-ups
- OIDC hosted sign-in (redirect flow to the F-036 provider) is a **documented seam** on the same
  session route. A double-submit CSRF token can be layered on if a future route needs `SameSite=None`.
- `TESSERA_API_URL` replaces the browser-exposed `NEXT_PUBLIC_API_BASE_URL` for data traffic.

## Alternatives considered

- **Token in `localStorage` / SPA memory + credentialed cross-origin CORS** — rejected: exposes a
  long-lived credential to XSS and complicates CORS; contradicts NFR-2 secure defaults.
- **Next middleware guard on cookie presence** — insufficient: it cannot tell zero-auth mode (no
  cookie, allow) from token-mode-not-signed-in (no cookie, redirect) without calling `/v1/me`; the
  client identity fetch does exactly that, so mode discovery lives there.
- **Keep the interim `lib/api` client** — rejected: F-045 explicitly closes ADR-0022 onto the SDK.

## References
- [ADR-0022](0022-interim-dashboard-data-client.md) (superseded by this + F-045),
  [ADR-0028](0028-api-auth-tenancy-rbac.md) (auth/tenancy/RBAC), [ADR-0035](0035-public-web-platform-three-surfaces.md)
  (app↔api origins), [ADR-0025](0025-generated-typescript-sdk-toolchain.md) (the SDK), effects **E-003**/**E-018**.
