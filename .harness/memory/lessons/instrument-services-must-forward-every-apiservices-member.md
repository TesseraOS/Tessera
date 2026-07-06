---
id: instrument-services-must-forward-every-apiservices-member
kind: lesson
title: A wrapper that REBUILDS a service object must forward every (optional) member — or it silently drops the ones added later; live-verify a UI feature against the real shipped server, not just stubs
links:
  - packages/observability/src/instrument-services.ts
  - packages/observability/src/instrument-services.test.ts
  - apps/server/src/api.ts
  - apps/server/src/mcp.ts
  - apps/web/lib/api/client.ts
  - apps/web/components/sources/sources-view.tsx
confidence: 0.9
created: 2026-07-06
---

**What happened:** F-041 (the `/sources` dashboard) consumes `GET /v1/sources`. Its unit + e2e tests were
green (they mock/stub the API at the network boundary), but the **first live run against the real shipped
server** 500'd every `/v1/sources*` route. Root cause: `@tessera/observability` `instrumentServices`
**rebuilds** the `ApiServices` object literal — `{ search, graph, memory, compiler, readiness? }` — and F-038's
`sources` + F-030's `billing` were never added to it. So on the **instrumented** server (which every shipped
process is — both `apps/server/api.ts` and `apps/server/mcp.ts` call `instrumentServices`), `services.sources`
was `undefined` and the routes threw "source management is not configured". The routes' own e2e passed only
because they inject services **directly into `buildServer`**, bypassing the wrapper. A second latent bug rode
along: the web `lib/api` `apiFetch` always set `content-type: application/json`, and Fastify **rejects a
bodyless request that advertises JSON** ("Body cannot be empty"), so `POST …/scan` and `DELETE` would 400.

**The lesson:**

1. **A wrapper that reconstructs an object (vs. `Proxy`-ing the original) is a silent-drop trap.** Every
   member the wrapper doesn't explicitly list disappears. When the wrapped type gains an **optional** member,
   the wrapper still typechecks (optional ⇒ omission is legal), so `tsc` never catches the drop. Prefer a
   forwarding `Proxy`/spread that carries unknown members, or make "forward every member" an explicit
   invariant with a **regression test** that asserts each optional member survives. Adding a member to a
   wrapped contract (`ApiServices`) ⇒ update the wrapper. This is the same class as the F-037 note that the
   tracing Proxy had to special-case `forTenant` (see [[forTenant-scoped-view-default-tenant-for-additive-row-isolation]]).

2. **Don't blanket-wrap methods you assume are async.** The tracing Proxy Promise-wraps every function, which
   would break `billing`'s **synchronous** methods (`[...listPlans()]`). Forward such services **untraced**
   (pass-through). Know which members have sync methods before wrapping.

3. **A green test suite that only exercises stubs has not verified the integration.** The UI's tests stubbed
   the API; the routes' tests injected services directly. Neither exercised the **composition root → wrapper →
   shipped server** path. **Boot the real server (fake embeddings + a scratchpad DB for speed/offline) and
   drive the actual feature** — that one step caught two production defects the whole gate suite missed. The
   frontend "screenshot-verify" bar is not just for pixels; it's an end-to-end integration probe.

4. **Tessera gotchas confirmed again:** axe (WCAG AA) flags `text-muted-foreground/70` at `text-[11px]` on the
   dark surface as insufficient contrast (4.06 < 4.5) — use full `text-muted-foreground`; and keep UI honest —
   when the runtime supports only `filesystem`/`git` sources, show GitHub as an **explicitly disabled** option,
   never a form that 400s.
