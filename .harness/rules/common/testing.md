# Rule: Testing (common)

Tests are the evidence that a feature works. "It compiles" is not done.

## What to test
- **Every feature ships with tests** covering its `acceptance` criteria in
  `feature_list.json`.
- **Ports get conformance suites.** Each port (storage, vector, embeddings, …) has one
  shared test suite that **every adapter must pass** — this guarantees Local↔Cloud parity
  ([ADR-0003](../../../docs/adr/0003-local-first-cloud-ready-ports-and-adapters.md)).
- **Bugs get a regression test first** (reproduce, then fix).

## Levels
- **Unit** — pure domain logic, fast, no I/O (use in-memory fakes of ports).
- **Integration** — adapters against real local backends (SQLite, sqlite-vec, filesystem).
- **E2E** — the surface an agent actually uses (MCP/REST), exercised end-to-end. E2E is
  required before a user-facing feature is `done` (see
  [`../../protocols/verification.md`](../../protocols/verification.md)).

## How
- Deterministic and isolated; no shared mutable state, no order dependence.
- Test behavior and contracts, not implementation details.
- **Name tests by the behavior** they assert; structure each with **Arrange-Act-Assert (AAA)**.
- A failing test is never "fixed" by deleting/skipping it without an explicit, recorded
  reason.
- Tooling: **Vitest** (unit/integration; wired in F-001) and **Playwright** (web E2E; added
  with the first web e2e feature).

## Layout (ADR-0014)
Split by test type — do not put everything in one place:
- **Unit tests: co-located** with source — `packages/<pkg>/src/foo.ts` + `foo.test.ts`
  (white-box; short `./foo` imports; refactor-safe).
- **Integration, e2e, and port conformance suites: separate** —
  `packages/<pkg>/tests/integration/`, `packages/<pkg>/tests/conformance/`; app e2e under
  `apps/api/tests/e2e/` and `apps/web/e2e/`. These are black-box and import the package's
  **public entry** (`@tessera/<pkg>`), not its `src/` internals.
- Build excludes `*.test.ts`; `tests/` lives outside `src` so it is never compiled or shipped.
