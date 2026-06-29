# Plan: F-008 — Knowledge graph + effect-links + get_effects (@tessera/knowledge-graph)

- **Feature:** F-008 · **Requirements:** FR-16, FR-17, FR-18, FR-19 · **ADRs:** 0003, 0005
- **Package:** `@tessera/knowledge-graph` (new) · **Author:** Claude · **Date:** 2026-06-29
- **Verification:** typecheck · lint · test (keep format + build green) · effect **E-002**

## Intent
A relational **knowledge graph** (nodes/edges) with typed **effect-links** ("change A ⇒ review B",
rationale + confidence + origin) derivable **statically** from the import/call graph and assertable
**manually**, plus **`get_effects(node)`** — a ranked, path-bearing traversal of dependents
(FR-16/17/18/19). Traversal via **recursive CTE** in SQLite (ARCHITECTURE §10), keeping the
local zero-dependency promise.

## Domain (`src/domain.ts`)
- `NODE_KINDS = ['file','symbol','module','person','decision','memory']` (ARCHITECTURE §5);
  `EDGE_KINDS = ['imports','calls','references','contains','owns','defines','supersedes','EFFECT_LINK']`;
  `EffectOrigin = 'static' | 'manual' | 'learned'`; `EFFECT_LINK_KIND = 'EFFECT_LINK'`.
- `GraphNode { id, kind, key, label, metadata }`; deterministic `nodeIdFor(kind, key)` (idempotent upsert).
- `GraphEdge { id, from, to, kind, rationale|null, confidence|null, origin|null, metadata }`;
  deterministic `edgeIdFor(from, to, kind)`. An **effect-link** is an edge with `kind==='EFFECT_LINK'`
  and rationale/confidence/origin set. `DEPENDENCY_EDGE_KINDS = ['imports','calls','references']`.
- `EffectHit { nodeId, node, path: NodeId[], distance, score }`.

## Static derivation (`src/effects/static-derivation.ts`, FR-18, pure)
`staticEffectLinksFrom(edges)`: for each dependency edge `dependent --(imports|calls|references)--> dependency`,
emit the **inverse** effect-link `dependency --EFFECT_LINK--> dependent` (origin `static`, high confidence,
rationale "dependent <kind> dependency"). Idempotent via `edgeIdFor`.

## Ranking (`src/effects/ranking.ts`, pure, shared by both adapters)
`selectBestRanked(candidates)`: dedupe by target node keeping the **best score** (product of edge
confidences along the path), sort by score desc → distance asc → id asc. Both adapters enumerate
candidate paths their own way, then rank through this one function (parity).

## Port (`src/ports/graph-store.ts`)
`GraphStore { addNode; addEdge; getNode(id); getNodeByKey(kind,key); listNodes(filter?{kind});
listEdges(filter?{kind,from,to}); getEffects(source, opts?{maxDepth}) }`. Upserts are idempotent by
deterministic id. `getEffects` traverses outgoing `EFFECT_LINK` edges transitively (cycle-guarded,
`maxDepth` default 6) and returns ranked {@link EffectHit}s with paths.

## Adapters (`src/adapters/`)
- `in-memory-graph-store.ts` — Maps; `getEffects` = BFS enumerating paths → `selectBestRanked`.
- `sqlite-graph-store.ts` — Drizzle `nodes` + `edges` tables over storage's `SqliteStore.db`;
  `CREATE TABLE IF NOT EXISTS` (+ indexes); `getEffects` via a **recursive CTE** over EFFECT_LINK
  edges (depth-bounded, path string cycle-guard) → `selectBestRanked`.

## Service (`src/service/knowledge-graph-service.ts`) — API/MCP-facing facade
`upsertNode`, `upsertEdge`, `assertEffectLink` (origin `manual`, FR-17/18), `deriveStaticEffectLinks`
(reads dependency edges, adds static effect-links; returns count), `getEffects` (FR-19; enriches hits
with readable path labels + the effect-link rationales). Zod-validated inputs.

## Tests (ADR-0014; intra-package imports via `../../src`)
- Unit (co-located): `static-derivation.test.ts` (inverse edges, origin/confidence, idempotent),
  `ranking.test.ts` (best-of-duplicates, sort order), `knowledge-graph-service.test.ts` (validation,
  manual + static effect-links, get_effects ranking/paths/NotFound).
- `tests/conformance/graph-store.conformance.ts` — every adapter: node/edge upsert idempotency;
  getNodeByKey; listEdges filters; **getEffects** transitive ranked dependents with correct paths +
  cycle safety.
- `tests/integration/in-memory-graph-store.test.ts` + `sqlite-graph-store.test.ts` (the latter runs
  conformance over a `:memory:` SqliteStore + a CTE multi-hop round-trip).

## Scope (acceptance is the contract)
- **In:** node/edge model + relational storage + recursive-CTE traversal; typed effect-links
  (manual + static); `get_effects` ranked with paths; service + conformance + tests.
- **Out (downstream):** **code parsing / symbol extraction** to *populate* nodes (OQ5 tree-sitter/LSP;
  done by ingestion extract processors later) — F-008 provides the substrate + API; tests/ingestion
  populate it. Graph retriever (F-009), web graph views (F-014), learned effect-links, temporal
  queries (FR-20, R1), drizzle-kit migrations (F-024).

## Dependencies
`@tessera/core`, `@tessera/storage`, `drizzle-orm`, `zod`. No new native deps.

## Anticipated effects
Realizes/updates **E-002** (KG node/edge + effect-link model ⇒ get_effects, graph retriever F-009,
web views F-014, harness effects.schema). New effect **E-011** (GraphStore port ⇒ its adapters +
conformance + the service + static-derivation/ranking).

## Risks
- Traversal correctness/cycles → cycle-guarded BFS + CTE; shared ranking ensures adapter parity.
- CTE portability (SQLite now, Postgres later) → standard recursive CTE; capability noted for pgvector/PG.
