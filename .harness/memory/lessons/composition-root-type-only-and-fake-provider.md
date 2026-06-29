---
id: composition-root-type-only-and-fake-provider
kind: lesson
title: A composition root depends on the surface contract type-only, and proves real wiring with the fake provider
links:
  - packages/config/src/profiles/local.ts
  - packages/config/tests/integration/local-profile.test.ts
  - docs/adr/0018-config-loader-and-local-profile.md
confidence: 0.9
created: 2026-06-29
---

**What happened:** F-015's `@tessera/config` is the composition root that wires every adapter into
the `ApiServices` the REST/MCP surfaces consume. Two choices kept it clean:

1. **Import the surface contract `ApiServices` `type-only`.** `config` must produce an `ApiServices`
   (defined in `@tessera/api`) but `api` will (eventually, via a process bin) depend on `config` —
   a value import would create an `api↔config` build cycle. `import type { ApiServices }` is erased,
   so the package edge is type-resolution only and one-way (`api` never imports `config`). Same trick
   the MCP surface used ([[mcp-twin-surface-type-only-and-inmemory-e2e]]). The runnable process bin
   that wires `config → startServer` lives *outside* both packages to stay acyclic.

2. **Prove the real wiring offline with the `fake` embeddings provider.** The integration test runs
   the *actual* Local profile (`:memory:` SQLite + sqlite-vec + a temp filesystem blob dir) and
   exercises memory/graph/search/compile — but selects `embeddings.provider: 'fake'` so nothing
   downloads a model. That tests the wiring (which is the feature) without the slow/networked part.
   The real `transformers` provider is covered by an **env-guarded** test (`TESSERA_TEST_TRANSFORMERS=1`),
   the same pattern F-005 used for the adapter itself.

**How to apply:**
- A composition root may depend on a lot of packages — that is its job — but keep it the *only* such
  place, and reference downstream surface contracts **type-only** to avoid cycles.
- Wire derived parameters from their source: here `embeddings.info.dimension` flows into the
  sqlite-vec store so the index always matches the active model — never hard-code a dimension.
- For integration tests of real wiring, swap only the slow/external leaf (embeddings → `fake`,
  stores → `:memory:`/temp dirs); keep everything else genuine so the test proves the composition.
