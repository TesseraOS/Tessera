---
id: turbo-cache-stale-uncommitted
kind: lesson
title: Turbo cache gave false-green on uncommitted changes; disabled cache for gate tasks
links:
  - turbo.json
  - .harness/protocols/verification.md
confidence: 0.9
created: 2026-06-28
---

**What happened:** during F-003, `pnpm typecheck/lint/test/build` (via turbo) reported cached
green ("FULL TURBO") after I added/edited files, but the input hash never changed for
**uncommitted working-tree edits** — turbo effectively hashed the committed state, so new or
edited-but-uncommitted files were invisible to the gates. A tracked file edited and even
`git add`-ed still produced the same hash; only `turbo --force` or a direct `vitest run`
reflected reality. The gate could therefore pass **without actually checking new code** — a
verification-reliability hole ("verification is the proof" was being undermined).

**Fix:** set `"cache": false` on `build`/`typecheck`/`lint`/`test` in `turbo.json`. The repo is
small, so correctness of the gates outweighs caching speed; turbo still orchestrates
`dependsOn`. Verified: gates now run fresh ("cache bypass, force executing") and reflect the
working tree.

**How to apply:** never trust a "FULL TURBO"/replayed gate result for new or uncommitted code —
run fresh. Keep gates cache-free until turbo's hashing is understood; if re-enabling caching
later, prove it invalidates on uncommitted changes, or restrict caching to CI (committed state).
See [[harness-model]] and [[engineering-standards]].
