---
id: react-query-session-status-off-iserror-not-data
kind: lesson
title: Derive auth/session status from React Query `isError`, not the presence of `data` — a failed refetch RETAINS the last successful data
links:
  - apps/web/lib/auth/use-session.tsx
  - docs/adr/0048-dashboard-auth-httponly-cookie-proxy.md
confidence: 0.95
created: 2026-07-14
---

**What happened:** F-045's `SessionProvider` fetched identity via `useQuery(['session','me'])`
and derived status as `if (query.data) → authenticated; else if 401 → signed-out`. Sign-in worked;
**sign-out silently did nothing** — after `DELETE /api/auth/session` + `invalidateQueries`, the
identity refetch 401'd, but the UI stayed "authenticated" and never redirected to `/signin`. The
e2e caught it (URL stuck on `/search`).

**Why:** React Query **keeps the last successful `data` across a failed refetch** by default
(`query.data` stays populated while `query.error` is also set). So on sign-out the 401 refetch left
`data` = the old identity, and the `if (query.data)` branch matched first — the signed-out branch
was unreachable. The presence of `data` is NOT "the latest fetch succeeded."

**How to apply:**
1. Key session/auth status off **`query.isError`** (the latest settled fetch), checked **before**
   `query.data`:
   ```ts
   if (query.isError) return isUnauthorized(query.error) ? signedOut : localFallback;
   if (query.data)   return authenticated(query.data);
   return loading;
   ```
2. Distinguish 401 (→ sign-in redirect) from other errors (→ degrade/offline fallback) inside the
   error branch — don't treat every error as signed-out.
3. Sign-out = clear the cookie server-side, then `invalidateQueries` the identity key; let the
   isError-driven status trigger the redirect (don't redirect imperatively from the mutation).
4. This generalizes to any "am I still logged in?" query — the retained-data trap bites whenever a
   session probe is invalidated after the credential is revoked.
