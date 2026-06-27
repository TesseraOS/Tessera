# Rule: TypeScript

Applies to all `.ts`/`.tsx`. Tessera is a TypeScript monorepo.

## Type safety
- `strict: true` (and `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`) across the workspace. Do not loosen `tsconfig` to silence errors.
- **No `any`.** Use `unknown` + narrowing at boundaries; precise types internally.
- Validate external data with **Zod**, then infer types from the schema (`z.infer`) — one
  source of truth for runtime + compile-time shape.
- Avoid non-null `!` assertions; prove non-null via narrowing instead.

## Modules & boundaries
- ESM only; explicit `exports` maps in `package.json` define each package's public API.
- Import other packages via their **public entry**, never deep paths into their `src`.
- `@tessera/core` is dependency-free internally; everything may depend on it.

## Style
- Prefer pure functions and immutability; isolate side effects behind ports.
- Discriminated unions over boolean flags for state; exhaustive `switch` with
  `assertNever`.
- Async: always `await` or explicitly handle promises; no floating promises.
- Errors: typed error classes from `@tessera/core`; never throw bare strings.

## Tooling
- **ESLint** (type-aware) + **Prettier** + **typecheck** are verification gates; code must
  pass all three. Boundary enforcement (no cross-package internal imports) is a lint rule.
