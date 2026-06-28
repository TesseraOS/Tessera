# Plan: F-002 — @tessera/core domain primitives

- **Feature:** F-002 ([`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-1 (validation/typed errors), NFR-8 (maintainability)
- **Package:** `@tessera/core` · **Author:** Claude · **Date:** 2026-06-28

## Intent
Flesh out the `@tessera/core` shell (F-001) into the shared, dependency-free domain
primitives every other package builds on: ids, typed errors, a Result type, config types,
and an in-process typed event bus.

## Approach (one module per concern; KISS/YAGNI)
- `src/id.ts` — branded `Id<Brand>` type + `newId()` (UUID v4 via `node:crypto.randomUUID`) +
  `isId()` guard.
- `src/errors.ts` — `TesseraError` base (stable `code`, `details`, `cause`) + subclasses
  (Validation/NotFound/Conflict/Unauthorized/Forbidden/Internal) + `ErrorCode` union.
- `src/result.ts` — `Result<T,E=TesseraError>` discriminated union + `ok/err/isOk/isErr`.
- `src/config.ts` — `DeploymentProfile` + `DEPLOYMENT_PROFILES` + `CoreConfig` types +
  `isDeploymentProfile()` guard. (Validated loader is F-015 — types only here.)
- `src/events.ts` — `createEventBus<TEvents>()`: typed `on/off/emit` (handlers run
  concurrently; `emit` awaits all).
- `src/index.ts` — re-export all (keep `VERSION`/`coreVersion`). NodeNext: relative imports
  use `.js` extensions.

Config: `packages/core/tsconfig.json` adds `"types": ["node"]` (for `node:crypto`);
`eslint.config.mjs` adds `'no-undef': 'off'` (TS handles undefined-checks).

## Files to touch
`packages/core/src/{id,errors,result,config,events}.ts` (+ `*.test.ts`), `src/index.ts`,
`packages/core/tsconfig.json`, `eslint.config.mjs`.

## Anticipated effects
Establishes `@tessera/core`'s **public API** — everything imports it. Record as effect
**E-006** (core API change ⇒ review all dependents). No external contract yet (no consumers).

## Test plan (Vitest, AAA)
Per module: id uniqueness + guard; error code/name/details + instanceof; Result helpers;
profile guard; event bus on/emit/off + async + multiple handlers.

## Verification
`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`, then
`node scripts/verify-state.mjs`; evidence → progress.md.

## Risks
- NodeNext `.js` import extensions in source (tsc requirement) — tests excluded from tsc use
  extensionless imports (vitest resolves).
- Typed-event-bus needs a couple of internal casts — keep them localized and commented.
