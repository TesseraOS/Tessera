---
id: docs-generate-needs-two-passes-for-a-new-route
kind: lesson
title: apps/docs generate needs TWO runs when a route is added — it reads the spec it is writing
links:
  - apps/docs/scripts/generate.mjs
  - apps/docs/tests/generated-drift.test.ts
confidence: 0.9
created: 2026-07-28
---

**What happened:** F-065 added five `/v1/notifications` routes. `pnpm --filter @tessera/docs
generate` wrote a fresh `generated/openapi.json` **and** reported writing the MDX reference pages —
but no `notifications/*.mdx` appeared, and the drift gate then failed with `ENOENT` on a file it
expected.

**Why:** `generate()` computes `generated/openapi.json` in memory, but `generateApiPages()` reads
that file **from disk**. On the first run it therefore renders pages from the *previous* spec; only
the second run sees the new one. The reported filenames are the ones written, which is why the output
looks correct.

**How to apply:** after adding or removing a route, run `pnpm --filter @tessera/docs generate`
**twice** before trusting the result, and confirm the new page exists on disk rather than reading the
run's output. The `generated-drift` test in the standard `test` gate catches it either way — but it
costs a full red run to find out.

Worth fixing at the source: `generateApiPages()` should take the spec it was just handed rather than
re-reading the file. Filed as an observation rather than done inline, because F-065 had no business
changing the docs pipeline.
