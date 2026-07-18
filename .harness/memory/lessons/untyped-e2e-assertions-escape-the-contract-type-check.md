---
id: untyped-e2e-assertions-escape-the-contract-type-check
kind: lesson
title: When a /v1 response shape changes, grep the api e2e for the route — TypeScript will not name it
links:
  - apps/api/tests/e2e/support/await-scan.ts
  - apps/api/tests/e2e/stats.e2e.test.ts
  - apps/api/tests/e2e/sources.e2e.test.ts
  - apps/api/src/schemas/sources.ts
  - .harness/plans/fix-e2e-async-scan-contract.md
  - .harness/plans/F-081-async-scan-jobs.md
confidence: 0.85
created: 2026-07-19
---

**What happened:** F-081 pt2 made the first breaking `/v1` response change — `POST
/v1/sources/:id/scan` went from synchronous `200 {source, summary}` to async `202 {source, state}`,
the summary now arriving via `GET /v1/sources/:id/scan` (`lastScan`). F-081 diligently resolved the
dependents it could *see* — the OpenAPI doc, the generated `@tessera/sdk`, and the dashboard — because
each consumes the contract through **typed** access (indexed `paths[...]` types, a regen-and-`tsc`
loop) and TypeScript pointed at every one. It also updated the **web** Playwright spec. But the two
**api-side** e2e tests (`stats.e2e.test.ts`, `sources.e2e.test.ts`) kept asserting the old contract
and only broke at *run* time, discovered features later.

The reason they slipped is the whole lesson: **e2e tests assert against `res.json()`, which is
`any`.** `expect(res.statusCode).toBe(200)` and `expect(stats.documents).toBe(2)` compile perfectly
against a route that now returns `202` and needs a poll — there is no type to disagree with. The
type-drift check that makes SDK/OpenAPI dependents self-announcing is exactly what an untyped e2e
assertion opts out of. A second, independent slip rode along: the async scan meant `documents`
lands *after* the request returns, and the test read stats in the same tick — a timing regression a
typed check could never have caught anyway.

The fix was tests-only (production was correct and intended): a shared `support/await-scan.ts` polls
`GET /v1/sources/:id/scan` until `state !== 'running'` — the **real completion signal**, bounded only
as a safety net, never a fixed `sleep` (timeout padding hides races, it does not fix them). Then
`stats.e2e` reads counts only after the manifest is populated, and `sources.e2e` asserts the async
`202` shape plus the summary on `lastScan`.

Bonus confirmation, worth stating so the next investigator does not chase it: the named suspect
"F-085 workers fail to boot under vitest" was a **red herring**. The embedding worker pool lives
entirely in `packages/ai` + `packages/config`; the in-memory e2e composition root uses a keyword
retriever + `createInMemoryDocumentSink` + `createInProcessQueue` and touches neither (`grep
worker_threads|piscina` is empty tree-wide). Rule a suspect in by tracing the *actual* code path the
failing test executes, not by the plausibility of the feature name.

**It happened again in the same change, one layer deeper.** The fix's own new helper
(`support/await-scan.ts`) inferred the wire type with `z.infer<typeof scanStatusResponseSchema>` but
imported `z` from the **v3 root** `'zod'`, while the schema is **`zod/v4`** (all of `src/schemas/*`
are). v3's `infer` rejects a v4 schema type (TS2344), so the helper's return type was silently wrong
— and `pnpm -w typecheck` was **40/40 green with the bug in the tree**, because `apps/api/tsconfig.json`
is `include: ["src/**/*"]`: the entire `tests/` directory is outside the typecheck gate. So it is not
only untyped `.json()` assertions that escape — *typed* test code escapes too, because the tests are
not compiled by any gate. When you write a typed test helper that infers from a schema, import `z`
from the **same** entrypoint the schema uses (`zod/v4` here) and typecheck it deliberately (an
isolated `tsc` over the file), because CI will not.

**How to apply:**
- When you change a `/v1` (or MCP) **response shape**, don't trust the compiler to find every
  dependent. `grep` the api e2e (and mcp e2e) for the route/tool and the fields you changed — those
  suites read untyped JSON and will not appear in the `tsc` fallout. The F-081 plan even *listed*
  "the e2e" as a dependent; the miss was that only the web spec got updated.
- Await async work over HTTP by **polling the real status/completion endpoint** until it leaves the
  in-flight state, bounded by a poll ceiling so a stuck job fails loudly. Never pad with a fixed
  delay — a green `sleep(500)` is a race waiting for slower hardware.
- Consider making the highest-value e2e assertions typed (cast `res.json()` to the SDK/schema type)
  so a contract change *does* surface at compile time — the smaller the untyped surface, the fewer
  run-time-only regressions.
