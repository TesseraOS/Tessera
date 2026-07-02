# ADR-0025: Generated TypeScript SDK — openapi-typescript types + openapi-fetch client

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Project lead, Claude
- **Tags:** sdk, api, codegen, dx, dependencies

## Context

FR-39 requires a **generated client SDK from the OpenAPI document; first-class TypeScript SDK**. The
`/v1` REST API already publishes an OpenAPI 3 document generated from the route Zod schemas
([ADR-0016](0016-rest-api-fastify-zod-bridge.md)), served at `GET /v1/openapi.json`. The interim web
data client `apps/web/lib/api` is hand-written and is meant to be **superseded** by this SDK
([ADR-0022](0022-interim-dashboard-data-client.md)).

The decision is the **toolchain and shape** of the SDK. Options ranged from heavy full-client generators
(OpenAPI Generator's `typescript-axios`, orval, swagger-typescript-api) that emit a large hand-editable
client, to type-only generation paired with a thin runtime. Constraints: production-grade, minimal and
trustworthy dependencies (NFR-1), TypeScript-first, and — crucially — the client must **never drift** from
the contract.

A related precedent: [ADR-0024](0024-github-connector-and-auto-memory-extraction.md) chose native `fetch`
over the *large* Octokit SDK to stay dependency-free. That reasoning is about avoiding a big, opinionated
dependency — not about banning all libraries.

## Decision

**We will generate the SDK's types with `openapi-typescript` and wrap them in a thin typed client built on
`openapi-fetch`.**

- **`openapi-typescript`** (devDependency, codegen only — never shipped) emits `paths` types from the
  OpenAPI document into `packages/sdk/src/generated/schema.ts`. A committed **generate script**
  (`pnpm --filter @tessera/sdk generate`) boots the API (an empty services object suffices — the doc is
  built from the static route schemas), reads `app.swagger()`, writes `openapi.json`, and runs the codegen.
  The generated file is committed and excluded from lint/format (`**/generated/**`) but still typechecked.
- **`openapi-fetch`** (runtime dependency — ~6 KB, **zero transitive dependencies**) turns the generated
  `paths` into a fully-typed fetch client. `createTesseraClient({ baseUrl, fetch?, headers? })` exposes
  ergonomic, named methods (`search`/`compile`/`getEffects` + memory CRUD) and maps the `{ error }`
  envelope to a typed `TesseraApiError`.

This keeps the **hand-written surface tiny** (a few method wrappers + error mapping); the request/response
**types are generated**, so the SDK cannot drift from the API. Regenerating after an API change updates the
types, and `tsc` then flags any wrapper that no longer matches.

## Consequences

### Positive
- The SDK is contract-faithful by construction; a route change is caught at compile time after regen.
- Minimal maintained code; `openapi-fetch` is tiny, zero-transitive-dep, and TypeScript-first.
- One typed client for web (superseding `lib/api`), tests, and any TS consumer.

### Negative / Costs
- One new runtime dependency (`openapi-fetch`) — accepted: it is small, focused, and the idiomatic
  consumer of `openapi-typescript` output (unlike the large Octokit rejected in ADR-0024).
- The generated types are checked in; they must be **regenerated** when the API changes (a CI "regen ⇒ no
  diff" check is a sensible later addition).
- fastify-zod inlines schemas (no `components`), so the generated types are inline per-path — fine for
  `openapi-fetch`, and the SDK re-exports named aliases for ergonomics.

### Neutral / Follow-ups
- **Migrate `apps/web` off `lib/api` onto `@tessera/sdk`** (ADR-0022) — a separate UI change, deferred.
- Additional generated SDKs (other languages) can follow the same spec; TS is first.

## Alternatives considered

- **Full-client generators (OpenAPI Generator / orval / swagger-typescript-api)** — emit a large,
  hand-editable client; heavier deps and more generated surface to review. Rejected: more code, more drift
  surface, heavier toolchain for no gain over types + a thin client.
- **Types-only + a hand-written native-`fetch` client (zero runtime dep)** — most consistent with ADR-0024,
  but re-implements what `openapi-fetch` does (path/query/body typing, param interpolation) as bespoke,
  drift-prone plumbing. Rejected: the point of a *generated* SDK is to minimize hand-written surface.

## References

- FR-39; [ADR-0016](0016-rest-api-fastify-zod-bridge.md) (OpenAPI from Zod),
  [ADR-0022](0022-interim-dashboard-data-client.md) (interim client superseded),
  [ADR-0024](0024-github-connector-and-auto-memory-extraction.md) (native-fetch precedent). Effect `E-003`.
