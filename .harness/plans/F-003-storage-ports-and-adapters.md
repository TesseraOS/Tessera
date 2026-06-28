# Plan: F-003 — storage ports + adapters + conformance

- **Feature:** F-003 ([`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-50 (local store), NFR-5 (scalability/parity) · **ADRs:** 0003, 0005
- **Package:** `@tessera/storage` · **Author:** Claude · **Date:** 2026-06-28

## Intent
The first ports & adapters layer: define the storage **ports** and their **local adapters**,
all behind one **conformance suite** each adapter must pass — guaranteeing Local↔Cloud parity
when Postgres/S3/Redis adapters land later (ADR-0003). Depends on `@tessera/core` (errors/Result).

## Ports (driver-independent)
- **`RelationalStore`** — lifecycle (`migrate`, `healthcheck`, `close`) + access to a typed
  query layer (Drizzle, [ADR-0005](../../docs/adr/0005-orm-drizzle.md)). Domain repositories
  build on this; the port hides the engine (SQLite now, Postgres later).
- **`BlobStore`** — `put`/`get`/`delete`/`exists`/`list` over opaque bytes by key.
- **`Queue`** — `enqueue`/`process`(consumer)/`shutdown`; idempotent, retryable jobs.

## Local adapters
- **SQLite** `RelationalStore` (Drizzle + a SQLite driver — see Decision below).
- **Filesystem** `BlobStore` (`node:fs`, under a configured root).
- **In-process** `Queue` (async, in-memory; the local default).

## Open decision (this plan): SQLite driver
Drizzle needs a SQLite driver. Options:
- **better-sqlite3** — mature, synchronous, the most Drizzle-proven; native module but ships
  prebuilt binaries (usually no compile on Windows/Node 22). **Recommended.**
- **node:sqlite** — built into Node 22 (zero install, no native build) but **experimental**
  (emits warnings; API may shift). Fallback if better-sqlite3 prebuild fails here.
- **libsql** — SQLite-compatible, clean path to remote (Turso); extra abstraction.
Decision is asked before implementing the SQLite adapter; install is verified immediately.

## Layout (ADR-0014)
```
packages/storage/
  src/
    ports/{relational,blob,queue}.ts   + index.ts
    adapters/{sqlite,filesystem,in-process-queue}/...
    index.ts
  tests/
    conformance/{relational,blob,queue}.conformance.ts   # shared contract suites
    integration/*.test.ts                                # adapter runs of the suites
```
Co-located unit tests for pure helpers; conformance/integration in `tests/` (black-box).

## Increments (commit per green increment)
1. Package skeleton + the three **port interfaces** (+ types). Gates green.
2. **In-process Queue** adapter + queue conformance suite. (pure TS, no deps)
3. **Filesystem BlobStore** adapter + blob conformance suite. (`node:fs`)
4. **SQLite RelationalStore** adapter (Drizzle + chosen driver) + relational conformance +
   drizzle-kit migration wiring.

## Anticipated effects
- New shared contracts: the storage **ports**. Record effect **E-007** (port change ⇒ all
  adapters + conformance suites — generalizes E-001 to the concrete package).
- Consumers (ingestion F-006, memory F-007, config wiring F-015) will depend on these ports.

## Test plan
Each port has one **conformance suite** (behavioral contract); each adapter runs it in
`tests/integration` against a real local backend (temp dir / temp sqlite file). Unit tests for
any pure logic. AAA; deterministic; isolated temp resources cleaned up.

## Verification
`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` green;
`node scripts/verify-state.mjs`; evidence → progress.md. CI already runs these.

## Risks
- SQLite driver native-build on Windows (mitigated by prebuilt better-sqlite3; node:sqlite fallback).
- Keeping the RelationalStore port engine-agnostic while using Drizzle — expose lifecycle +
  query handle, keep dialect specifics inside the adapter.
