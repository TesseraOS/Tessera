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
- A failing test is never "fixed" by deleting/skipping it without an explicit, recorded
  reason.
- Tooling target: **Vitest** (unit/integration) and **Playwright** (web E2E) — wired when
  the toolchain lands.
