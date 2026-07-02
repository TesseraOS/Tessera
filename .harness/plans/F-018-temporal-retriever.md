# Plan: F-018 — Temporal retriever (recency / time-window weighting)

- **Feature:** F-018 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-24
- **ADRs:** none new (fits ADR-0003 ports & the F-009 fusion design; the `Retriever` interface already anticipates temporal)
- **Package:** `@tessera/retrieval` (extend) + `@tessera/config` (wire) · **Author:** Claude · **Date:** 2026-07-02
- **Verification:** typecheck · lint · test (keep format + build green workspace-wide)

## Intent
Add the **fifth** retrieval signal (FR-24) behind the **existing** `Retriever` interface: a **temporal**
retriever that ranks items by **recency** (exponential decay) with an optional **time-window**, so the
fusion ranker (F-009) can weight recent knowledge alongside semantic/keyword/graph/symbolic. "Done" =
`temporal` is a first-class `RetrieverKind`, passes the shared conformance suite, fuses with the others,
and is wired into the Local profile's hybrid search.

## Scope (acceptance is the contract — nothing more)
- **In:** `'temporal'` added to `RETRIEVER_KINDS`; a `createTemporalRetriever` adapter owning a
  persistent SQLite index (`index`/`remove`, mirroring the keyword retriever); recency-decay scoring +
  optional window + injected clock; conformance + integration + fusion tests; Local-profile wiring +
  `Runtime.temporal` exposure.
- **Deliberately out (noted honestly):** per-**query** time windows (would change the shared
  `RetrievalQuery` contract → API ripple; kept as a construction-time option here, per-query is a later
  API concern); learned/keyword-aware temporal blending; config-exposed fusion weights (F-020); ingestion
  actually populating the index (the same downstream corpus-wiring seam keyword/semantic already have).

## Approach — reuse first
The `Retriever` interface, `Candidate` shape, and `fuse()` ranker are **reused unchanged**; fusion is
rank-based so a new signal needs no score normalization, and `FusionOptions.weights` already accepts any
`RetrieverKind`. The API `retrieverKindSchema = z.enum(RETRIEVER_KINDS)` is **derived**, so it picks up
`'temporal'` automatically; the compiler treats `RetrieverKind` as an opaque tag (no switch); the web
`SignalBadge` already maps `temporal` (`--chart-5`). So widening the enum is **fully additive** end-to-end.

The temporal retriever mirrors the **keyword** retriever's owned-index pattern: it takes a SQLite
`db` handle and owns a `retrieval_temporal(ref PRIMARY KEY, ts INTEGER)` table; `index(ref, ts)` upserts,
`retrieve` selects the most-recent refs (`ORDER BY ts DESC, ref ASC LIMIT n`, optional `ts >= now-window`)
and scores each by exponential recency decay `2^(-age/halfLife)` (best-first, monotonic → satisfies the
conformance ordering invariant). The clock is injected for deterministic tests.

## Files to touch
- `packages/retrieval/src/domain.ts` — add `'temporal'` to `RETRIEVER_KINDS`; refresh the comments.
- `packages/retrieval/src/adapters/temporal-retriever.ts` — **new**: `TemporalRetrieverOptions`
  (`db`, `table?`, `now?`, `halfLifeMs?`, `windowMs?`) + `TemporalRetriever` (`index`/`remove`) +
  `createTemporalRetriever`. Normalizes `number|string|Date` timestamps to epoch ms (invalid → typed
  `ValidationError`).
- `packages/retrieval/src/index.ts` — export the new adapter.
- `packages/config/src/profiles/local.ts` — construct `createTemporalRetriever({ db })`, add it to the
  hybrid retriever's set, and expose it on the runtime.
- `packages/config/src/runtime.ts` — add `readonly temporal: TemporalRetriever` (exposed so ingestion
  can index item timestamps, like `keyword`).
- `packages/retrieval/tests/integration/temporal-retriever.test.ts` — **new**: conformance + recency
  ordering + window filter + decay score + limit + re-index idempotency + a fusion test showing a recent
  item is boosted when temporal joins keyword.

## Anticipated effects
- **E-012** (Retriever interface + Candidate + fusion): **widened** — `RETRIEVER_KINDS` gains `'temporal'`;
  a new adapter + conformance coverage. Additive: derived API enum, opaque compiler tag, temporal-ready
  web badge — no consumer breaks.
- **E-014** (config Local profile): the profile now constructs + exposes the temporal retriever (additive
  to the hybrid set + `Runtime`).

## Test plan
- **Conformance:** run `runRetrieverConformance('temporal', 'temporal', …)` (best-first, limit-respecting).
- **Unit/integration (`:memory:` SQLite):** recency order (newest first); `windowMs` excludes stale items;
  decay score in `(0,1]`, monotonic with age; injected `now` makes it deterministic; re-index updates a
  ref's timestamp; invalid timestamp throws.
- **Fusion:** `createHybridRetriever([keyword, temporal])` — a recent item shared/boosted by temporal ranks
  above an older one, with a `temporal` `SignalContribution` present (attribution).

## Verification
Workspace-wide: `node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` ·
`pnpm test` (new retrieval tests green; api/mcp/web/config suites unbroken by the widened enum) · `pnpm build`.

## Risks / open questions
- **Enum widening rippling to a consumer** → audited: API enum is derived, compiler tag is opaque, web badge
  already handles `temporal`; gates confirm.
- **Timestamp units** → `number` is treated as **epoch ms** (documented); `string`/`Date` parsed; invalid → throw.
- **Empty index in the Local profile** → temporal contributes nothing until ingestion populates it (harmless;
  same seam as keyword/semantic). No behavior change to existing search tests.
