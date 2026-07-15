# Plan: F-046 Account & profile — profile page, API-token self-service, admin user management

- **Feature:** F-046 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-65 (profile/account), FR-48 (governance/admin), NFR-2 (secure auth) — [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** apps/web (`@tessera/web`); enablers in `@tessera/api` (`/v1/tokens`, `/v1/rbac`), `@tessera/mcp` (token tools — ADR-0036 parity), `@tessera/sdk`
- **Author:** Claude (orchestrator) · **Date:** 2026-07-14

## Intent
Give a signed-in user a professional account surface: see who they are (identity, roles, effective
permissions, tenant, plan), **self-serve API tokens** (create with scopes/expiry, copy-once, revoke),
and — for admins — see the token principals in their tenant. Every operation is REST **+ MCP** (the
ADR-0036 parity rule) over the existing `TokenStore` port; no UI-only ops, no fake data.

## Approach
Thin routes/tools over the existing `TokenStore` (issue/verify/revoke/list already exist). The
dashboard stays a pure API client (ADR-0036).

1. **API `/v1/tokens`** — `GET` (list, no secrets), `POST` (create → secret returned **once**),
   `DELETE /:id` (revoke). Guarded by `admin:manage`, **audited** (new `token.read`/`token.manage`
   audit actions). Scoped to the caller's tenant. `buildServer` gains a `tokenStore?` option; when
   absent (zero-auth Local — no token store) the routes answer a clean `409 CONFLICT`
   ("token management requires token auth mode"), never a crash. Create validates roles/scopes
   against the RBAC catalog and rejects a principal escalating **beyond its own permissions**
   (least-privilege: you cannot mint a token more powerful than you).
2. **API `/v1/rbac`** — authenticated `GET` returning `{ roles, permissions, rolePermissions }` from
   the auth model, so the dashboard **derives the RBAC catalog from the API** (kills the
   hand-mirrored `apps/web/lib/governance.ts` copy + its drift risk).
3. **MCP parity (ADR-0036)** — `list_tokens` / `issue_token` / `revoke_token` tools over the same
   `TokenStore`, gateway-authorized `admin:manage`; `buildMcpServer`/`startMcpStdio` gain the token
   store; `apps/server` wires `runtime.auth.tokenStore`.
4. **SDK** — `listTokens`/`issueToken`/`revokeToken`/`getRbac`; OpenAPI + types regenerated.
5. **Web** — a `/profile` page (identity + roles + effective permissions + tenant + plan from
   billing + connected-agent hints, all API-backed); a **token self-service** panel (list · create
   with role/scope pickers + **copy-once** secret dialog · revoke); an **admin user management**
   view (token principals grouped from the token list with their roles — "role assignment" is
   issuing a scoped token; OIDC-user listing = documented seam). `lib/governance.ts` RBAC catalog →
   the `/v1/rbac` hook. Profile reached from the NavUser menu + a `/profile` route (chrome shell).

## Files to touch
- **API:** `src/schemas/tokens.ts` (new), `src/schemas/rbac.ts` (new), `routes/v1/tokens.ts` (new),
  `routes/v1/rbac.ts` (new), `routes/v1/index.ts` (+register, thread `tokenStore`), `server.ts`
  (`tokenStore?` option), `src/audit/model.ts` (+`token.read`/`token.manage`), `src/index.ts`
  (+exports); `tests/e2e/tokens.e2e.test.ts` (new). Effect **E-018**/**E-020**.
- **MCP:** `src/schemas.ts` (token shapes), `src/gateway.ts` (+tool names + `admin:manage` perms),
  `src/server.ts` (register token tools, take the store), `src/stdio.ts` + `apps/server/src/mcp.ts`
  (thread `runtime.auth.tokenStore`); `tests/e2e/*`.
- **SDK:** regenerate `openapi.json` + `generated/schema.ts`; `src/client.ts` (+4 methods + types);
  `tests/integration/sdk.test.ts`.
- **Web:** `app/profile/page.tsx` + `components/profile/*` (profile, tokens panel, users view),
  `components/nav-user.tsx` (+Profile link), `lib/governance.ts` (RBAC from `/v1/rbac` via a hook),
  `lib/api/client.ts` + `hooks.ts` (+token/rbac methods + hooks), `lib/api/types.ts` (+token/rbac
  types); `apps/server` wires the store into `buildServer`. `tests/e2e/profile.spec.ts` (new);
  `auth.spec.ts` may gain the issue-token→authenticate flow.
- **Docs:** ADR-0036 already governs (parity rule); no new ADR expected (thin routes/tools over an
  existing port — the established one-engine/two-surfaces pattern). Effect-trace records the surface.

## Anticipated effects
- **E-018** (auth control plane): the `TokenStore` gains a REST + MCP + UI surface; least-privilege
  create rule; the RBAC catalog is now API-exposed (`/v1/rbac`) and web-consumed.
- **E-003** (REST/SDK/dashboard): new `/v1/tokens` + `/v1/rbac` routes ⇒ regenerate OpenAPI + SDK;
  the dashboard consumes them.
- **E-020** (audit): token create/revoke/list are audited actions.
- **E-004** (design tokens): the profile + token + users UI is tokens-only, themed, WCAG AA.

## Test plan
- **API e2e:** create → list (no secret in list) → the issued secret authenticates `/v1/me` →
  revoke → the secret 401s; `admin:manage` required (viewer 403); least-privilege create rejected;
  409 when no token store; audited. **/v1/rbac** returns the catalog.
- **MCP e2e:** the token tools issue/list/revoke over a real SDK client, gateway-authorized.
- **SDK integration:** the four methods round-trip.
- **Web:** unit (token panel copy-once + revoke confirm; profile renders API identity; users list
  from tokens); **e2e** (`profile.spec.ts`: profile renders identity/roles/plan; issue a token in
  the UI, reveal-once, and — against the real token server — the issued token authenticates; axe AA).
- Screenshot-verify the profile + token dialog in the browser (frontend quality bar).

## Verification
`node scripts/verify-state.mjs` · `pnpm -w typecheck` · `pnpm -w lint` · `pnpm -w format` ·
`pnpm -w test` · `pnpm -w test:e2e` · `pnpm -w build`. Capture counts + screenshots as evidence.

## Risks / open questions
- **No token store in zero-auth mode** — token management returns 409 + the UI shows an honest
  "requires token auth mode" state; the profile page still renders identity in both modes.
- **"Admin user management"** is bounded by the store: principals are derived from the token list
  (grouped), role assignment = issuing a scoped token; a first-class user directory + OIDC-user
  listing are documented seams (no fabricated users).
- **Least-privilege create** must be enforced server-side (a member must not mint an owner token);
  covered by an e2e case.
- **Copy-once secret** must never be re-fetchable (only the hash is stored) — the UI reveals it once
  from the create response and never persists it.
