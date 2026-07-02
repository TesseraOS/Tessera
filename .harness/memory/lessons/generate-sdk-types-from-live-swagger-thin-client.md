---
id: generate-sdk-types-from-live-swagger-thin-client
kind: lesson
title: Generate an SDK's types from the API's own OpenAPI, wrap them in a thin typed client
links:
  - packages/sdk/scripts/generate.mjs
  - packages/sdk/src/client.ts
  - packages/sdk/tests/integration/sdk.test.ts
  - docs/adr/0025-generated-typescript-sdk-toolchain.md
confidence: 0.85
created: 2026-07-02
---

**What happened:** F-022 built `@tessera/sdk`. Rather than a heavy full-client generator (OpenAPI
Generator/orval) or a fully hand-written client, the shape that worked best:

1. **Generate the types from the API's *own* OpenAPI doc.** The generate script does
   `buildServer({}).swagger()` — the doc is built from the **static route schemas**, so the handlers
   never run and an empty/stub services object is enough to produce a complete spec. Feed that document to
   **openapi-typescript** → a committed `src/generated/schema.ts`. No need to run a live, fully-wired
   server or fetch over the network to generate.
2. **Wrap the generated `paths` in a thin typed client** (openapi-fetch): a handful of named methods +
   error-envelope mapping. The request/response types are **derived** from the generated `paths` via
   indexed access (`paths['/v1/x']['post']['responses'][200]['content']['application/json']`), so nothing
   is hand-maintained. A route change ⇒ regenerate ⇒ `tsc` flags any wrapper that no longer matches.
3. **Commit the generated file, but exclude it from lint + format** (`**/generated/**`) while keeping it
   **typechecked** (the client imports it) — so generated-code churn doesn't fight the formatter, yet drift
   still fails the build.

Verify a generated client by a **round-trip against the real API over a socket** with **stub services that
return schema-valid canned data** — the routes serialize through the real Zod pipeline, so the test
exercises request encoding, real HTTP, response parsing, typing, and error mapping without standing up the
whole engine.

**How to apply:**
- To generate a client from an in-repo API, get the spec from the server's own `swagger()`/OpenAPI export
  (built from static schemas) — don't hand-copy a spec or require a fully-wired runtime.
- Prefer **generated types + a thin typed runtime** over a heavyweight generated client; keep the
  hand-written surface minimal so the contract, not the client code, is the source of truth.
- Commit generated artifacts, ignore them for lint/format, keep them typechecked; add a "regen ⇒ no diff"
  CI check later to catch a stale SDK.
