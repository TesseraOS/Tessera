---
id: authentication-is-not-authorization-on-a-shared-bus
kind: lesson
title: A shared bus behind an authenticated endpoint is a broadcast — F-044 hardened who may connect, never what they then see
links:
  - apps/api/src/routes/v1/events.ts
  - apps/api/src/events.ts
  - docs/adr/0050-sse-tenant-scoped-event-stream.md
  - packages/config/src/profiles/local.ts
confidence: 0.95
created: 2026-07-16
---

**What happened:** F-060 needed `/v1/events` for a notifications bell. The route was authenticated
(F-044 explicitly hardened "SSE auth"), so it looked done. It subscribed each connection to a
**process-wide** bus and wrote every event straight to the socket:

```ts
API_EVENT_TYPES.map((type) => events.on(type, (payload) => raw.write(sseFrame(type, payload))))
```

No tenant filter. Every authenticated client received every tenant's `path`, `title` and `label`. The
leak had been live since F-021 built the stream *before* multi-tenancy (F-025) existed, and F-044
walked past it while working on that exact file.

**The generalizable trap:** for a request/response route, `forTenant(tenantOf(request))` puts
authorization on the same line as the read, so omitting it is visible. For a **subscription**, the
authorization decision moves to *delivery* — a different place, and a different time, from the
handler. "The endpoint is authenticated" answers *who may connect*, never *what they may then see*.
Any fan-out primitive (a bus, a pub/sub topic, a websocket room, a webhook fan-out) inherits this:
**a shared bus behind an auth check is a broadcast with a doorman.**

**Why no gate caught it:** every api/mcp e2e runs in the zero-auth default tenant, where one tenant
receiving all events is *correct*. The isolation bug is invisible unless a test drives **two** tenants
at once. Same blind spot that hid F-071. A cross-tenant case is not an edge case — for any
tenant-scoped surface it is the primary case, and a single-tenant test suite cannot see it.

**What to do:**
- Make the tenant a **required** field on the event payload, never optional. An optional field is a
  filter that fails open; a required one makes the typechecker ask "whose event is this?" at every
  emit site — including the next one someone adds. Here it found the missed site immediately.
- Strip it at the **one** serialization point (`sseFrame`), not at call sites: tenancy decides
  delivery without reaching the wire, so the public shape is unchanged and existing consumers keep
  working (ADR-0033 + golden rule 6 at once).
- **Verify the regression test actually fails without the fix.** Remove the filter, watch both
  isolation tests go red, restore it. A security test that passes vacuously is worse than none.
- Make the negative assertion wait on a **positive** signal first: assert tenant B sees its *own*
  event before asserting it never saw tenant A's, or "nothing has arrived yet" silently passes for
  "the leak is closed".
- When a producer genuinely cannot know the tenant (here the ingestion worker — F-071), **encode the
  asymmetry in the type** and attribute honestly to where the data really went. Do not invent an
  optimistic attribution: under-delivering is recoverable, leaking is not.

**The meta-lesson:** the feature that *surfaces* a latent flaw is the one that has to fix it. F-060
would have taken a leak nobody could see and rendered it on every page. "Pre-existing, so out of
scope" is right for a latent defect (the F-048 precedent that registered F-071/072/073 rather than
fixing them) and wrong the moment your feature amplifies it.
