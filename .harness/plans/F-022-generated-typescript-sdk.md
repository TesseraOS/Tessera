# Plan: F-022 — Generated TypeScript SDK from OpenAPI

- **Feature:** F-022 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-39
- **ADRs:** **0025 (new — SDK generation toolchain: openapi-typescript + openapi-fetch)**; relates to ADR-0016 (OpenAPI), ADR-0022 (interim `lib/api` this supersedes)
- **Package:** `@tessera/sdk` (new) · **Author:** Claude · **Date:** 2026-07-02
- **Verification:** typecheck · lint · test (keep format + build green)

## Intent
Ship a **first-class TypeScript SDK generated from the `/v1` OpenAPI document** (FR-39): the request/
response **types are generated** from the spec (never hand-drifted), wrapped in a small, ergonomic, typed
client. "Done" = `createTesseraClient({ baseUrl })` calls `search`/`compile`/`effects`/`memory` with full
types, mapping the `{ error }` envelope to a typed error, proven against the real API.

## Scope (acceptance is the contract — nothing more)
- **In:** the `@tessera/sdk` package; a committed **generate script** that boots the API, reads
  `app.swagger()`, writes `openapi.json`, and runs **openapi-typescript** → `src/generated/schema.ts`; a
  typed `createTesseraClient` over **openapi-fetch** with methods for search/compile/effects/memory + a
  `TesseraApiError`; a round-trip test against the real in-memory API; ADR-0025.
- **Deliberately out (noted honestly):** **migrating `apps/web` off `lib/api`** onto the SDK — ADR-0022
  anticipates it, but it's a separate UI change (touches the dashboard + web e2e); F-022 ships the SDK and
  leaves the swap as a documented follow-up. Non-TS SDKs (FR-39 "SDK(s)") — TS first. Auth headers beyond a
  passthrough `headers` option (auth is R2).

## Approach — generated types + a thin typed client
Consistent with ADR-0016 (the Zod route schemas are the single OpenAPI source): generate the client
**types** from that spec so they can never drift, and wrap them in the minimal ergonomic client.
**openapi-typescript** (devDependency, codegen only — not shipped) emits the `paths` types;
**openapi-fetch** (a ~6 KB, zero-dependency runtime client) turns them into a fully-typed fetch client with
no hand-written request plumbing — the right tradeoff for a *generated* SDK whose value is fidelity + low
drift (contrast F-017/ADR-0024, which avoided the *large* octokit; this is a tiny, spec-faithful client).
Recorded in **ADR-0025**.

## Files to touch
- `packages/sdk/package.json` — `@tessera/sdk`; scripts (build/typecheck/lint/test/**generate**); dep
  `openapi-fetch`; devDeps `openapi-typescript` + `@tessera/api` (for the doc) .
- `packages/sdk/tsconfig.json` — extends base (mirrors sibling packages).
- `packages/sdk/scripts/generate.mjs` — boot `buildServer(stub)` → `app.swagger()` → write `openapi.json`
  + `openapiTS(doc)` → `src/generated/schema.ts`.
- `packages/sdk/src/generated/schema.ts` — **generated** `paths` types (committed; eslint/prettier-ignored).
- `packages/sdk/src/errors.ts` — `TesseraApiError` + `{error}`-envelope parsing.
- `packages/sdk/src/client.ts` — `createTesseraClient({ baseUrl, fetch?, headers? })` over
  `createClient<paths>`; typed `search/compile/getEffects/captureMemory/listMemories/getMemory/editMemory/
  memoryHistory`; unwrap `{ data, error }` → throw `TesseraApiError` on non-2xx.
- `packages/sdk/src/index.ts` — exports.
- `packages/sdk/openapi.json` — the emitted spec (committed; prettier-ignored).
- `packages/sdk/tests/integration/sdk.e2e.test.ts` — boot the real in-memory API (`listen:0`), point the
  SDK at it, exercise the methods, assert typed results + a typed error path.
- `eslint.config.mjs` + `.prettierignore` — ignore `**/generated/**`.
- `docs/adr/0025-*.md` + ADR index.

## Anticipated effects
- **E-003** (REST/MCP surface contract): **realizes** the long-recorded `@tessera/sdk` consumer — the SDK
  is generated from the same OpenAPI the routes produce; regenerating on an API change is how it stays in
  lockstep (NFR-11 additive). Supersedes `apps/web/lib/api` (ADR-0022) once the web swap lands.

## Test plan
- **Integration (round-trip):** start the in-memory API on a socket; `createTesseraClient({ baseUrl })`;
  `search` returns ranked candidates; `compile` returns a budget-bounded package; `captureMemory` →
  `getMemory`/`memoryHistory` round-trip; a not-found `getMemory` throws a `TesseraApiError` with
  `code: 'NOT_FOUND'`. Types are exercised at compile time (the test is written against the SDK's types).

## Verification
Workspace-wide: `node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` ·
`pnpm test` (new sdk round-trip; other packages unaffected) · `pnpm build`. The generated `schema.ts` is
committed so no gate needs to boot the API for codegen.

## Risks / open questions
- **Codegen drift** → the generate script is committed and reproducible; regenerate when routes change
  (a CI check that regen produces no diff is a later refinement). tsc catches client/type mismatches.
- **Generated-file hygiene** → `**/generated/**` ignored by eslint + prettier; still typechecked (imported
  by the client) so it must be valid TS.
- **New dependency** → openapi-fetch is tiny + zero-transitive-dep; justified for a generated SDK (ADR-0025).
