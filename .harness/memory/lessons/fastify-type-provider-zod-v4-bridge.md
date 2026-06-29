---
id: fastify-type-provider-zod-v4-bridge
kind: lesson
title: fastify-type-provider-zod@5 needs Zod-v4 schemas (zod/v4), even on a Zod-3 install
links:
  - apps/api/src/schemas/common.ts
  - apps/api/src/server.ts
  - docs/adr/0016-rest-api-fastify-zod-bridge.md
confidence: 0.95
created: 2026-06-29
---

**What happened:** Wiring `@tessera/api` (F-011) with Fastify + `fastify-type-provider-zod@5.1` +
`@fastify/swagger@9`, every route returned **500** — even `/health`. The Pino log showed
`FST_ERR_INVALID_SCHEMA: Invalid schema passed: {…ZodObject…}` thrown by the lib's
`resolveSchema`, which does `if (maybeSchema instanceof $ZodType)` — `$ZodType` is **Zod's v4
core** class. Our schemas were authored with the **classic Zod-3 API** (`import { z } from 'zod'`),
whose objects are not `instanceof $ZodType`, so validation AND serialization were rejected.

**Why:** `fastify-type-provider-zod@5` peers `zod >=3.25.67` but actually consumes the **v4** API.
Zod `3.25.x` ships *both*: the classic API at `zod` and the new v4 API at the `zod/v4` subpath. The
peer range is satisfied by the install, but the *schemas you pass* must be v4 objects.

**How to apply:**
- With `fastify-type-provider-zod@5+`, author route schemas with `import { z } from 'zod/v4'`. No
  second dependency — it's the same physical `zod@3.25.x`. Domain packages can keep classic `zod`;
  only plain validated JSON crosses the API boundary (services re-validate), never schema objects.
- Watch v4 API shifts: `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` (key+value).
- Two more Fastify footguns hit on the way: (1) **never `await app.register(...)`** — the Fastify
  instance is a thenable, so awaiting boots `ready()` early; enqueue synchronously. (2) Register
  `@fastify/swagger` **before** routes so its `onRoute` hook captures them.
- Verifying a "every route 500s" mystery: enable `{ logger: true }` and `app.inject()` once — the
  real cause is in the error log, not the response body (which the envelope masks to a generic 500).

Related: [[zod-exactoptional-bridge]] (the other Zod gotcha in this repo).
