# ADR-0014: Test organization — co-located unit tests, separate integration/e2e

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Project lead, Claude
- **Tags:** testing, conventions, repo

## Context

We needed a single, consistent convention for where test files live across the monorepo.
Two patterns were weighed: **co-locate everything** in `src/` vs a **separate `tests/` tree**
(`tests/unit`, `tests/integration`). Research into current TypeScript/Vitest practice showed
the prevailing convention is a **split by test type**, not one tree: unit tests are co-located,
while integration/e2e go in a dedicated directory (a `src/` + `tests/` everything-separated
layout is more a Java/Maven idiom). There is a concrete technical driver, not just taste:
unit tests are white-box (often touch internals → short relative imports), while integration/
e2e are black-box (test the public contract across modules → import the package entry).

## Decision

Adopt a **hybrid** layout:

```
packages/<pkg>/
  src/
    foo.ts
    foo.test.ts            # UNIT — co-located, white-box, imports './foo'
  tests/
    integration/*.test.ts  # INTEGRATION — real adapters/DB/fs; imports '@tessera/<pkg>'
    conformance/*.ts       # shared port-contract suites (ADR-0003)
apps/api/tests/e2e/        # API e2e (MCP/REST)
apps/web/e2e/              # web e2e (Playwright)
```

- **Unit tests co-located** with their module (`*.test.ts` beside `*.ts`).
- **Integration, e2e, and port conformance suites** in a separate per-package `tests/` dir
  (apps keep e2e under `tests/e2e` / `e2e`).
- Build excludes `*.test.ts`; `tests/` sits outside `src` (`rootDir`) so it is never compiled
  or published. Vitest discovers `**/*.test.ts` in both locations.

## Consequences

### Positive
- Unit tests stay attached to code (refactor-safe, short imports, TS/Vitest-idiomatic).
- Integration/e2e are cleanly separated and discoverable by scope; they exercise the public
  package API like real consumers.
- `src/` ships clean; no parallel mirrored tree to maintain for units.

### Negative / Costs
- Two locations to know (units in `src`, the rest in `tests/`). Documented in the testing rule.
- `src/` contains test files alongside source (accepted; the trade for refactor-safety).

### Neutral / Follow-ups
- **F-003** is the first feature with `tests/integration` + `tests/conformance`; decide there
  whether integration tests resolve the package via `src` or built `dist` (Vitest alias vs
  build-first), and wire Playwright with the first web e2e.

## Alternatives considered

- **Full separation (`tests/unit` + `tests/integration`)** — the lead's initial idea; rejected
  for units due to brittle `../../src` imports and a mirrored tree to keep in sync, and because
  it cuts against the TS toolchain grain. Its strength (clean separation) is kept for
  integration/e2e.
- **Co-locate everything** — rejected: integration/e2e don't map to one source file and clutter
  `src`.

## References

- [`.harness/rules/common/testing.md`](../../.harness/rules/common/testing.md),
  [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (conformance suites).
