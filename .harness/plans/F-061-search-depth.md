# Plan: F-061 Dashboard: search depth — excerpts, kind filters, result detail, keyboard nav, virtualization

- **Feature:** F-061 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-41, FR-49 (from [`../../docs/PRD.md`](../../docs/PRD.md))
- **Service / package:** apps/web (primary) · apps/api · apps/mcp · @tessera/sdk · @tessera/config · @tessera/retrieval
- **Author:** planner subagent + Claude Opus 4.8 · **Date:** 2026-07-16
- **Status:** in_progress

## Intent

Turn `/search` from a ranked list of 64-char hashes into an investigation surface: every result
carries a readable label, a query-relevant excerpt with honest highlighting, and a kind; selecting
one opens a detail panel with full provenance and two actions that wire search → compile → effects.
**Done** = a user searches their real repository, reads *why* and *what* matched without leaving the
page, and lands in the Inspector or on the effect-links of the file they found.

## Requirements — what they actually say

- **FR-41** (PRD.md:206): "**Global search across code/memory/graph with result provenance.**" Pri M, Rel R0.
- **FR-49** (PRD.md:214): "UX baseline: command palette (⌘K), themes, skeleton/empty/error states,
  toasts, optimistic updates, **virtualized lists**, WCAG AA." Pri M, Rel R0→.

Neither requirement mentions excerpts, kind filters, or a detail view — those are this feature's
reading of "search with provenance" being useful. The acceptance in `feature_list.json` is the
binding contract; §Scope limits records where it cannot be met truthfully.

---

## Findings (verified against the tree — paths + lines)

### 1. `Candidate.label` ALREADY EXISTS, end to end. Nothing populates it for ingested content.

- `packages/retrieval/src/domain.ts:21-27` — `Candidate { ref, signal, score, label?: string }`.
  The doc comment at :25 already reads *"Optional human-readable label/snippet for the item."*
- `packages/retrieval/src/domain.ts:41-47` — `FusedCandidate { ref, score, signals, label? }`.
- `packages/retrieval/src/fusion/fuse.ts:62-66` — fusion **carries `label` first-wins**: the first
  retriever to supply one sets it; a later candidate fills it only if still `undefined`.
- `apps/api/src/schemas/search.ts:24` — `label: z.string().optional()` on `fusedCandidateSchema`.
- **`packages/sdk/src/generated/schema.ts:374` — `label?: string;` is already in the committed SDK.**

Which retrievers set it:

| Retriever | Sets `label`? | Evidence |
|---|---|---|
| `graph` | ✅ `node.label` | `adapters/graph-retriever.ts:42,47,49` |
| `symbolic` | ✅ `node.label` | `adapters/symbolic-retriever.ts:38` |
| `keyword` (FTS5) | ❌ | `adapters/keyword-retriever.ts:71-77` — returns `{ref, signal, score}` |
| `semantic` (vector) | ❌ | `adapters/semantic-retriever.ts:23-27` — same |
| `temporal` | ❌ | `adapters/temporal-retriever.ts:103-109` — same |

⇒ **F-073 is not a contract problem. It is three retrievers whose refs never meet the corpus.**
The wire, the SDK, the fusion merge and the UI fallback are all already in place.

### 2. The corpus already stores everything F-061 needs, under one lookup

- `packages/config/src/sources/ingestion-sink.ts:30` — every ingested document is written with
  `metadata: { ...document.metadata, sourceId: document.source.id, path: document.path }`.
- `packages/config/src/sources/memory-indexing.ts:36` — every memory with
  `metadata: { lineageId, kind, title }`, `kind: 'memory'`, ref = `memory/<lineageId>` (:9-11 —
  note the `/`, the doc comment at :22 saying `memory:<lineageId>` is stale).
- `packages/config/src/sources/corpus-indexer.ts:71-83` — one `putFragment` + keyword + temporal +
  vector write per ref, all from `IndexDocumentInput { ref, text, kind, metadata }`.
- **The "get the text for this ref" path already exists**: `FragmentSource.get(ref)` →
  `{ ref, text, kind, metadata }` (`packages/context-compiler/src/ports/fragment-source.ts:1-17`),
  implemented over the blob corpus by `createBlobFragmentSource`
  (`packages/config/src/fragment-source.ts:34-58`), and used by the compiler's resolve stage
  (`packages/context-compiler/src/stages/resolve.ts:20-42`).

⇒ **One `fragmentSource.get(ref)` yields the label (`metadata.path`), the excerpt (`text`), and the
kind (`kind`) — the three things F-061 needs and the one thing F-073 needs.** They are the same call.

### 3. Refs are path-hashes, and there are TWO ref spaces for the same file

- `packages/ingestion/src/domain.ts:123-126` — `documentIdFor(sourceId, path) = sha256(sourceId:path)`.
  (F-073's title says "content hash"; it is actually an **identity** hash of `sourceId:path`. Same
  symptom, 64 hex chars.)
- `packages/knowledge-graph/src/domain.ts:110-112` — `nodeIdFor(kind, key) = sha256(kind:key)`.
- `packages/ingestion/src/adapters/graph-extraction-sink.ts:48-53` — file nodes are
  `{ kind:'file', key: fileNodeKey(path), label: posix.basename(path), metadata:{path} }`.
- `packages/ingestion/src/symbols/resolve-import.ts:19-21` — `fileNodeKey` = the **extensionless**
  source-relative path (ADR-0041).

⇒ `src/ledger.ts` exists under **two different refs**: the document ref (keyword/semantic/temporal)
and the graph node id (graph/symbolic). Fusion keys on `ref`, so it **cannot merge them** — the same
file can occupy two rows of one result set. Today this is invisible (one row shows a hash, the other
shows `ledger.ts`). **Labelling the document ref makes the duplicate visible.** See SL-4.

### 4. `POST /v1/search` — the exact shape, and what it lacks

`apps/api/src/schemas/search.ts:5-30`:
```
searchBodySchema     = { query: string(min 1), limit?: int 1..100 }
fusedCandidateSchema = { ref, score, signals: signalContributionSchema[], label? }
searchResponseSchema = { results: fusedCandidate[] }
```
`apps/api/src/routes/v1/search.ts:21-28` — `requirePermission('search:read')`,
`config: { audit: 'search' }`, and the tenant-scoped call
`services.search.forTenant(tenantOf(request)).search({text, limit})`.

- **There is NO kind filter on `/v1/search` today.** Body is `{query, limit}` only.
- Compile *does* have one — `filters.kinds` (`apps/mcp/src/schemas.ts:20-23`), applied **after**
  resolution on `fragment.kind` (`resolve.ts:25,35-36`), i.e. `'code'|'markdown'|'text'|'memory'`.
- Extension is additive per NFR-11: new optional body fields + new optional response fields only.

### 5. ⚠️ The perf gate is the binding constraint on this feature

`tests/bench/thresholds.json:22-31` and `tests/bench/results/baseline.json:36-45`:

| Metric | Threshold | Measured (fake emb.) | Headroom |
|---|---|---|---|
| `tokensPerAnswer.searchRest` | **900** | **727** | **173 tokens** |
| `tokensPerAnswer.searchMcp` | **900** | **727** | **173 tokens** |
| `latencyMs.searchP95` | 300 | 5.56 (10.76 real) | vast |

The threshold file says this, verbatim (`thresholds.json:26`):
> *"~24% headroom absorbs a float wobble in the temporal score; a real fattening of the ranked answer
> trips it, **which is the point — adding a field to a search hit should be a deliberate decision, not
> a silent tax on every agent**."*

and (`thresholds.json:3`):
> *"A miss is a tuning work item (a registered feature), not an edited number here: if you are reading
> this because a gate failed, the fix is in the code or a new feature, not in this file."*

**Arithmetic that decides the design.** Default `limit` = 10 (`DEFAULT_RETRIEVAL_LIMIT`,
`retrieval/src/domain.ts:6`); 727 tokens ≈ 72/result.
- A **snippet** at even 20 tokens/result = **+200 → 927 > 900. THE GATE FAILS.** A useful 200-char
  snippet (~50 tok) = +500 → 1227. **Snippets cannot be on by default.**
- A **label** (`,"label":"src/modules/module-042.ts"` ≈ 35 chars ≈ 9 tok) = **+~90 → ~817 < 900.**
  Passes with ~9% left. Must be *measured*, not assumed.

Latency is a non-issue: 10 extra blob reads against a 5.56ms p95 under a 300ms ceiling.

### 6. Virtualization already exists — the acceptance's premise is STALE (again)

- `apps/web/package.json:23` — **`"@tanstack/react-virtual": "^3.14.5"` is already a dependency.**
- `apps/web/components/memory/memory-view.tsx:4,157-203` — F-041 already ships a real
  `useVirtualizer` list (`estimateSize: 84`, `overscan: 8`, `role="list"`/`"listitem"`,
  `measureElement`, absolute rows + `getTotalSize()` spacer).
- `apps/web/components/memory/memory-view.test.tsx:24-30` — the reusable RTL precedent:
  *"jsdom has no layout, so the real virtualizer measures a 0-height viewport and renders nothing;
  stub it to render every row (real virtualization is verified in e2e + screenshots)."*
- `@tanstack/react-table` is **not** a dependency — F-063 will add it.

⇒ Acceptance criterion 3's *"first real FR-49 virtualization"* is **false**. This is the same class of
staleness as F-060's *"the dashboard gains its FIRST /v1/events consumer (none exists today)"*, which
turned out to be the third. Recorded as-built (SL-5).

### 7. `MemoryView` is the template for almost all of this feature

`apps/web/components/memory/memory-view.tsx` already composes, in one view: a kind `Select` filter
(:82-94), a derived second filter with **real values only** (:56-63), a virtualized list (:157-203),
skeleton/empty/error states (:111-141), and a detail surface opened from `selected` state (:143-147).
`apps/web/components/memory/memory-detail.tsx:40-41` — the detail surface is a **Radix `Sheet`**
(`side="right"`, `sm:max-w-xl`), not a route. `GraphSidePanel` (`graph-view.tsx:214-222`) is the same
idea. F-061 should look like these, not invent a third pattern.

### 8. Provenance is already half-built — in a tooltip

`apps/web/components/provenance/signal-badge.tsx:33-42` already renders `rank`, `score`, `weight` and
`contribution` per signal — but only inside a `TooltipContent`, i.e. hover-only (bad on touch, and
invisible when you want to compare two results). The detail surface's job is to render the same
`SignalContribution` data **expanded and persistent**. No new data is needed for acceptance #2's
"per-signal rank/score/weight" — it is on the wire today.

### 9. `GET /v1/effects` is keyed by `{kind, key}` — NOT by ref. This is decisive.

- `apps/api/src/routes/v1/effects.ts:20-42` — querystring `{ kind, key, maxDepth? }`.
- `apps/web/components/graph/graph-view.tsx:46-47` — the only existing caller builds
  `{ kind: selected.kind, key: selected.key }` from a **graph node it already has**.
- `apps/web/lib/api/hooks.ts:203-210` — `useEffects(query | null)`, `enabled: query !== null`.

⇒ To offer "show effects" on a **file** result you must produce `{kind:'file', key: fileNodeKey(path)}`.
**That requires the path — F-073's exact payload — and `fileNodeKey`'s extension-stripping rule, which
lives in `@tessera/ingestion` (`resolve-import.ts:19-21`), a package `apps/web` does not and should not
depend on.** So the mapping must be computed server-side.

**Deep-linking to `/graph` is a trap, verified:** `GraphView` holds *all* state locally (`useState`,
:30-33) with no URL params, and loads at most `GRAPH_LIMIT = 500` nodes (:20) then resolves selection
via `byId.get(selectedId)` (:42-43). A deep link to a node outside the first 500 would **silently
resolve to `null`**. Rejected — render effects inline instead (D7).

### 10. The Inspector has no seed path, and adding one has a build-breaking caveat

`apps/web/components/inspector/inspector-view.tsx:22` — `const [task, setTask] = useState('')`. No
URL param, no store. Compile is an explicit `useMutation` (`hooks.ts:30-34`, `inspector-view.tsx:24`).
**Caveat:** `useSearchParams()` in the Next app router requires a `<Suspense>` boundary or
`next build` fails ("useSearchParams() should be wrapped in a suspense boundary") — so
`apps/web/app/inspector/page.tsx` must be updated in the same increment, not discovered at the `build`
gate.

### 11. ⚠️ The blob corpus is NOT tenant-partitioned

`packages/storage/src/ports/blob.ts:5-16` — `BlobStore` has `put/get/delete/exists/list`. **No
`forTenant`.** `putFragment(blob, fragment)` writes key = `fragment.ref` with no tenant prefix
(`fragment-source.ts:20-26`), and `createBlobFragmentSource(blob)` reads any ref (:34-58).
`local.ts:246` hands that unscoped source to the compiler.

Today this is **safe by construction** — every ref reaching the corpus came from a
`forTenant`-scoped retriever — but it means **any `GET /v1/fragments/:ref` endpoint would be a
cross-tenant IDOR**: tenant A could read tenant B's file body by presenting a ref, and refs are
derivable (`sha256(sourceId:path)`), not secret. This is precisely the ADR-0050 class of defect
(a surface that authenticates but does not authorize). See D6 / SL-2.

### 12. Conventions, gates, and the traps F-060 hit

- **Data flow:** `apps/web/.harness/rules/frontend.md:7-8` — SDK + TanStack Query only.
  `apps/web/lib/api/client.ts:78` (`search`), `:83` (`getMemory` — **already exists**, tenant-scoped).
  `apps/web/lib/api/types.ts:17-40` is a **hand-maintained mirror** (ADR-0022) still used for search
  while newer types come from `@tessera/sdk` (`client.ts:29-37`, ADR-0048) — both must be updated.
- **SDK regeneration (F-060's trap):** `pnpm --filter @tessera/sdk generate` writes
  `packages/sdk/openapi.json` + `src/generated/schema.ts` (**both committed**), and any new exported
  type must ALSO be re-exported from `packages/sdk/src/index.ts:10-47`.
- **`instrumentServices` trap (E-015):** `packages/observability/src/instrument-services.ts:58-73`
  **rebuilds** `ApiServices`; an omitted member is silently dropped and 500s in production
  (`.harness/memory/lessons/instrument-services-must-forward-every-apiservices-member.md`).
  ⇒ **This plan adds no `ApiServices` member** (D2).
- **MCP tool-name assertions are SAFE:** `apps/mcp/src/gateway.test.ts:34-49` asserts the exact sorted
  set of 14 tools. **We add no tool** — only an optional arg to the existing `search`
  (`apps/mcp/src/schemas.ts:15-18`), so this test and the mcp e2e are unaffected.
- **MCP parity is structural for free:** `apps/mcp/src/server.ts:185` returns
  `services.search.forTenant(...).search(query)` raw — the same object REST returns. Enrich the
  *service* and both surfaces get it (the F-060 `computeWorkspaceStats` lesson).
- **e2e permission fixtures:** `apps/web/tests/e2e/support/fixtures.ts:12-23, 29-40` hardcode
  permission arrays. F-061 adds **no new permission** (`search:read`/`effects:read`/`memory:read` all
  present) ⇒ **no fixture change needed**. Verified.
- **Design tokens / contrast:** `docs/design/DESIGN-SYSTEM.md`, 4 themes × 2 modes (F-070/ADR-0047);
  `apps/web/tests/contrast.test.ts` asserts every **registered** token pair — a new token pair used as
  text (e.g. the `<mark>` highlight) must be registered there in the same change.
- **Existing tests that will move:** `apps/web/components/search/search-view.test.tsx:42` asserts
  `src/a.ts` renders; `apps/web/tests/e2e/search.spec.ts:27` asserts `fuse()`;
  `tests/e2e-full/tests/human-journey.spec.ts:38-42` carries the comment *"Results are labelled by
  content-hash ref today — the ingested corpus sets no label; see F-073"* and asserts only signals;
  `tests/e2e-full/tests/agent-journey.spec.ts:74-76` the same (*"Refs are content hashes, not paths —
  so assert on the SIGNAL"*).
- `scripts/verify-state.mjs:245-250` requires `.harness/plans/F-061-*.md` while `in_progress`.

---

## ✅ OQ-1 — RESOLVED 2026-07-16: fold F-073 into F-061 (operator approved)

**Decision: fold it in.** The operator approved the recommendation below; **symbol-result effects
(SL-3) stay deferred**, so the E-012 change remains type-only. F-073 → `done` ("delivered by F-061")
at close-out, with `progress.md` recording it. No ADR: F-073 deviates from no default — it populates
a field the contract already declares.

**Verified independently before escalating** (not taken on the planner's word): `Candidate.label`
exists at `packages/retrieval/src/domain.ts:25-26` with the comment "Optional human-readable
label/snippet for the item"; `label: z.string().optional()` is at `apps/api/src/schemas/search.ts:24`;
only `graph-retriever.ts` and `symbolic-retriever.ts` reference `label` (keyword/semantic/temporal do
not); `tests/bench/results/baseline.json:37-38` measures `searchRest`/`searchMcp` at **727** against
the **900** ceiling (`thresholds.json:25,29`) ⇒ **173 tokens of headroom**; `GET /v1/effects` takes
`effectsQuerySchema` (`{kind, key, maxDepth?}`), not a ref.

The original recommendation and its reasoning follow.

**Recommendation: YES — fold it in.** F-061 is R3, F-073 is R4; the harness orders by release then id,
so this is a deliberate scope decision the operator must approve (golden rule 2), not a planner's call.

**The overlap, quantified:**

| | F-073 | F-061 | Shared? |
|---|---|---|---|
| Requirements | FR-41, FR-26 | FR-41, FR-49 | **FR-41** |
| Effects | E-012, E-003 | E-003, E-012, E-004 | **F-073's effects ⊂ F-061's** |
| Mechanism | `fragment.metadata.path` → `Candidate.label` | `fragment.text` → snippet; `fragment.kind` → filter | **the same `fragmentSource.get(ref)` call** |
| Wire change | **none** (`label?` already in `schemas/search.ts:24` + `sdk/.../schema.ts:374`) | +`snippet`, +`kind`, +`node` | F-073 rides F-061's regeneration for free |
| UI | `search-view.tsx:80` `label ?? ref` | rewrites `search-view.tsx` wholesale | **the same file, the same line** |
| e2e | `human-journey.spec.ts:38-42` (its acceptance names this) | the same spec + `search.spec.ts` | **the same assertions** |

**F-073's marginal cost inside F-061 is ~3 lines** (`label: metadata.path` in the enrichment decorator)
**plus one e2e assertion swap.** Because F-061 must build the ref→fragment lookup regardless, the label
is a **byproduct of a lookup that is already happening**.

**Three ways F-061's acceptance cannot be met honestly while every result is titled by a sha256:**

1. **Acceptance #2, "show effects": literally impossible.** `GET /v1/effects` is keyed `{kind, key}`
   (`effects.ts:20-42`) and file nodes are keyed `fileNodeKey(path)`
   (`graph-extraction-sink.ts:49-50`). **The path is the join key**, and the path is F-073's payload.
   Without it, the flagship "what breaks if I change this?" action cannot be wired to a file result at
   all.
2. **Acceptance #2, "open in Inspector as task seed": actively harmful.** The compile task text *is*
   the retrieval query (`compiler.compile({task})` → retriever). Seeding a task with
   `a3f8b2c9d1e4…` feeds a 64-char hash into FTS + embeddings. A seed is only meaningful once the
   label is a real path (D8).
3. **Acceptance #1, "results show excerpts": half-honest.** An excerpt under a hash title tells you
   *what* matched but never *where* it lives — the user still cannot act on it. "Results stop being a
   dead end" is the stated goal; a hash **is** the dead end.

**Cost of NOT folding (doing F-073 later, as its own R4 feature):**
build the enrichment seam → ship a UI knowingly titled by hashes → reopen the same decorator, the same
`FusedCandidate`, the same `search-view.tsx`, the same e2e specs weeks later to add one field; two
SDK regenerations; two effect-link passes over E-003 + E-012; and F-061 ships failing its own
acceptance #2. That is strictly worse on every axis.

**Cost of folding:** F-061 grows by ~3 lines of code, one e2e assertion, and ~90 tokens on the perf
gate's default search answer (§Finding 5) — which is a *deliberate decision*, exactly the kind
`thresholds.json:26` demands be made explicitly. F-073's R4 slot is vacated.

**If the operator declines the fold:** F-061 must ship with acceptance #2's "show effects" **absent for
file results** and the task seed reduced to the bare query — both stated in the progress log as
unmet acceptance, not quietly dropped. That is the honest fallback, and it is worse.

**Mechanics if approved:** F-073 → `status: "done"`, with `progress.md` and `feature_list.json`
recording "delivered by F-061"; F-073's e2e clause is satisfied by F-061's `human-journey.spec.ts`
change; no ADR needed (F-073 introduces no decision that deviates from a default — it populates a
field the contract already declares).

---

## Design decisions (and their justification)

**D1 — Enrichment lives in a `@tessera/config` decorator, not in the retrievers, the API, or MCP.**
New `packages/config/src/sources/search-enrichment.ts`:
`createEnrichedRetriever(inner: HybridRetriever, fragmentSource: FragmentSource): HybridRetriever`.
- **Mirrors the established composition-root pattern exactly**: `corpus-indexer.ts`,
  `ingestion-sink.ts`, `memory-indexing.ts` are all cross-package decorators in this very directory
  (`packages/config/src/index.ts:19-21`). `createIndexingMemoryService` is the closest analogue.
- **Parity is structural, not duplicated.** REST (`search.ts:26`) and MCP (`server.ts:185`) both call
  `services.search` — enrich once, both surfaces get it. This is the F-060 `computeWorkspaceStats`
  lesson: two copies of the same aggregation can silently disagree.
- **No `ApiServices` member added** ⇒ the E-015 `instrumentServices` trap (F-041's production 500s)
  is structurally avoided. `search` is already forwarded and traced (`instrument-services.ts:60`).
- **`packages/retrieval` stays pure** — no dependency on the corpus, no new port, no adapter or
  conformance churn. Rejected alternatives: enriching inside each retriever (3 sites; semantic and
  temporal have no corpus handle); enriching in `HybridRetriever` (forces `packages/retrieval` to
  depend on the compiler's `FragmentSource` port); enriching in the route (needs `fragmentSource` on
  `ApiServices` → E-015 trap → and MCP would need a second copy).
- **Tenant-safe by construction:** the decorator wraps a `forTenant`-scoped inner retriever and only
  ever calls `fragmentSource.get(ref)` for refs that scoped retriever already returned. It **cannot**
  widen the tenant's visibility, which is exactly why the unscoped `BlobStore` (Finding 11) is
  acceptable *here* and not for a by-ref endpoint (D6).

**D2 — `FusedCandidate` gains three optional fields; `RetrievalQuery` gains one. (E-012, additive.)**
```ts
// packages/retrieval/src/domain.ts
interface RetrievalQuery  { text; limit?; snippet?: SnippetRequest }   // NEW: snippet?
interface FusedCandidate  { ref; score; signals; label?; kind?; snippet?; node? }  // NEW: kind/snippet/node
```
Type-only, optional, no adapter or conformance changes. Required because the decorator must return
`HybridRetriever`'s declared type. **Watch:** `hybrid-retriever.ts:34-43` validates with
`querySchema` and then **reconstructs** `normalized` field-by-field — an unknown query field is
silently dropped there. That is fine (the decorator reads `query.snippet` *before* delegating) but it
must be understood, not stumbled over.

**D3 — The snippet is computed SERVER-SIDE. Not negotiable.**
The text lives in the blob corpus. Client-side excerpting would require shipping **whole file bodies**
to the browser for every result — the exact opposite of the feature, and a gratuitous exposure of full
file contents. The compiler already excerpts server-side (`resolve.ts` + `compress-text.ts`).

**D4 — Do NOT reuse `compressToFit` (F-019). Write a small contiguous-window extractor; DO reuse
`extractTerms`.**
`packages/context-compiler/src/stages/compress-text.ts:59-83` solves a **different problem**:
- It selects the *most relevant segments from anywhere in the document* and rejoins them in original
  order (`:70-81`) — the output is **non-contiguous fragments joined by `\n`**. That is correct for
  *filling a token budget with the most relevant content*; it reads as an incoherent jumble as a
  search excerpt, where users expect a contiguous window around the match.
- It returns `{text, tokens}` — **no offsets**, so it cannot drive highlighting (D5).
- It is a compiler internal stage; reusing it would invert the layering (the compiler depends on
  retrieval, not the reverse) and freeze a compile-tuning knob into the search contract.

Instead: `extractSnippet(text, query, {maxChars})` in `packages/config/src/sources/search-snippet.ts`,
**reusing `extractTerms` from `@tessera/retrieval`** (`packages/retrieval/src/util/text.ts:8-19`) —
the *same tokenizer the keyword, graph and symbolic retrievers use* (its own doc comment says so).
That is the provenance-honest choice: the highlight then shows exactly what the retriever matched, not
a client-side guess. Deterministic, no LLM. Falls back to a leading window when no term matches (a
semantic-only hit legitimately has no lexical match — the snippet must still render, and must not
pretend to a highlight it doesn't have).

**D5 — Highlighting rides OFFSETS. No HTML on the wire, ever.**
```jsonc
"snippet": {
  "text": "the ledger appends a compensating entry",
  "matches": [{ "start": 4, "end": 10 }],   // offsets into `text`
  "truncatedStart": true, "truncatedEnd": true
}
```
The client slices the plain string and renders `<mark>` **React elements**. No `dangerouslySetInnerHTML`,
no HTML parsing, no sanitizer to get wrong — **XSS is structurally impossible, not merely mitigated.**
Rejected: (a) server-rendered `<mark>` HTML — the classic search-snippet XSS, absolutely not, and this
text is *ingested repository content*, i.e. attacker-influenceable; (b) plain text + client-side
matching — cheaper wire, but the client's tokenizer would drift from `extractTerms` and highlight
things the retriever did not match, which is a provenance lie.
`{start,end}` **objects** over `[start,end]` tuples: Zod tuples → OpenAPI 3.1 `prefixItems` →
`openapi-typescript` output is fragile; the ~20 extra tokens are irrelevant on an opt-in field.

**D6 — Snippets are OPT-IN, default OFF, on both REST and MCP. This is what keeps the perf gate green
and the agent bill honest.**
- `searchBodySchema` + `searchShape` gain `snippet?: { maxChars?: number }` (or `boolean`), default off.
- **Default REST/MCP response is byte-identical to today** ⇒ `tokensPerAnswer.searchRest/searchMcp`
  stay at 727 against the 900 threshold. The bench never sets the flag.
- **The dashboard opts in.** A human UI does not pay a token budget.
- **MCP: expose the flag, default off.** ADR-0036 parity means the agent surface must not be less
  *capable*; NFR-4 token-leanness means it must not be more *expensive by default*. Opt-in satisfies
  both, and an agent that wants to triage without a compile round-trip can now ask. Adds **no tool**
  ⇒ `gateway.test.ts:34-49` and the mcp e2e tool-set assertions are untouched.

**D7 — `label` and `kind` are ALWAYS ON (both surfaces). Deliberate, measured, escalated if it trips.**
Unlike the snippet, the label is not a UI nicety — **a sha256 is as useless to an agent as to a human**
(`agent-journey.spec.ts:74-76` had to assert on signals precisely because refs are unreadable). ~9
tok/result × 10 ≈ **+90 → ~817 < 900**, ~9% headroom left. **This is arithmetic, not a measurement** —
increment 2 measures it for real.
**If it exceeds 900 the answer is NOT to edit `thresholds.json`.** Per `thresholds.json:3`, the options
are (i) escalate to the operator with the number and argue the threshold up on the merits (an
ADR-grade argument: an unlabelled hit is not an answer), or (ii) make the label opt-in like the
snippet and accept that MCP keeps returning hashes. **Never a quiet rebaseline.**

**D8 — Detail surface = a Radix `Sheet`. No `/search/[ref]` route.**
- **Correctness, not taste:** provenance only exists *relative to a query*. `rank`/`score`/`weight`/
  `contribution` are properties of *this result in this search*. A standalone `/search/[ref]` route
  would have to re-run the search on a hard load just to reconstruct them — and would still be wrong
  if the corpus moved. The route is not a stable resource.
- **Precedent:** `memory-detail.tsx:40-41` (`Sheet side="right" sm:max-w-xl`) and `GraphSidePanel`.
- **Keyboard flow:** a Sheet preserves the list, its scroll, the virtualizer's window and the active
  index behind it — ↓ ↓ Enter Esc ↓ Enter works. A route navigation destroys all four.
- **a11y for free:** Radix Sheet gives focus trap + Escape + focus restoration.

**D9 — Kind filter is CLIENT-SIDE over the returned set, with honestly-labelled counts.**
- `kind` now rides each result, so the client filters and counts exactly.
- Server-side filtering is a *retrieval* concern that collides with fusion: `fuse()` already truncates
  to `limit` (`fuse.ts:83`), so filtering after fusion returns fewer than `limit`; doing it properly
  means over-fetching, filtering, and re-truncating — which changes ranking semantics. Out of scope,
  and the acceptance does not ask for it.
- **Honesty rule (the D4-of-F-060 discipline):** counts are labelled *within the current results* —
  "12 results · 8 files · 3 memories · 1 symbol" — **never** implying a corpus-wide count. Filtering
  to `memory` with none present says *"No memories in these results — try a more specific query"*,
  never *"No memories"*.
- Kind vocabulary is **derived** (the acceptance's file/memory/symbol is not a stored field):
  fragment exists && `kind === 'memory'` → **memory**; fragment exists && kind ∈ `code|markdown|text`
  → **file**; **no fragment** (graph/symbolic node ref) → **symbol**. Verified against
  `DocumentKind = 'code'|'markdown'|'text'|'binary'` (`ingestion/src/domain.ts:54`), `'memory'`
  (`memory-indexing.ts:34`), and `resolve.ts:33-34` dropping graph refs with *"no content for ref"*.

**D10 — Virtualized list: `react-virtual` directly, mirroring `memory-view`. F-063 owns the TABLE.**
- F-061 owns the **virtualized list** (`useVirtualizer`, `role="listbox"`); F-063 owns the
  **virtualized data-table** (`@tanstack/react-table` + `react-virtual`: columns, sorting, sticky
  header, cursor pagination).
- **Do not build a shared wrapper in F-061.** It would have exactly one consumer, and F-063's table
  needs column models and header/measurement concerns a list wrapper cannot model — the abstraction
  would be wrong before it had a second user. Two direct consumers of `react-virtual` is not
  duplication; a premature shared primitive is a liability. The **library** is the shared primitive,
  and it is already installed (`package.json:23`).
- Different ARIA semantics anyway: `listbox`/`option` (single-select, activedescendant) vs.
  `table`/`grid` (2-D navigation). Forcing one component to be both is how both end up broken.

**D11 — Keyboard nav: `listbox` + `aria-activedescendant`, with the virtualization trap handled.**
- `role="listbox"` on the scroll container (single tab stop), `role="option"` + `aria-selected` per
  row, `aria-activedescendant` → the active option's id. ↑/↓ move, Home/End jump, Enter opens the
  Sheet, Escape clears. ↓ from the search input moves focus into the listbox.
- **The trap:** `aria-activedescendant` MUST reference an element that exists in the DOM. Under
  virtualization the active row may be unrendered ⇒ **`virtualizer.scrollToIndex(i)` must run as the
  active index changes**, or screen readers announce nothing while the visuals look fine. This gets an
  explicit test.
- No reusable arrow-nav utility exists to reuse: `cmdk` (`command-palette.tsx:27-90`) does this
  internally but only inside `CommandDialog`; the ⌘K handler itself (`:32-41`) is the only
  hand-rolled keyboard code in the app. Reuse the *pattern* (cmdk's own activedescendant approach),
  not the component.

**D12 — Task seed: `/inspector?task=<query> — <label>`; prefill only, NEVER auto-compile.**
- Compile is an explicit, budget-spending, entitlement-clamped mutation. Auto-running it on navigation
  would surprise the user and burn quota. Prefill and let them press Compile.
- The seed references the result (it is a per-result action) via the label — which is only sane once
  the label is a real path (**⇒ D12 depends on OQ-1**). Falls back to the bare query with no label.
- `apps/web/app/inspector/page.tsx` must wrap `<InspectorView />` in `<Suspense>` (Finding 10) or
  `next build` fails — do this in the same increment.

**D13 — "Show effects" renders INLINE in the Sheet via the existing `useEffects` hook.**
- The enrichment supplies `node?: { kind, key }`, server-derived — for file fragments,
  `{kind:'file', key: fileNodeKey(metadata.path)}` (`@tessera/config` already depends on
  `@tessera/ingestion`; `apps/web` must not).
- The Sheet calls `useEffects(node ?? null)` (`hooks.ts:203-210`, `enabled: query !== null`) and
  renders ranked dependents with paths — **staying in the investigation flow**, which is what the
  acceptance asks for ("wiring search → compile → effects into one investigation flow").
- Navigating to `/graph` is rejected on evidence (Finding 9: no URL state + the 500-node limit makes
  a deep link silently resolve to nothing).
- **The action is ABSENT, never disabled-with-a-lie, when `node` is undefined** (memory results;
  symbol results — see SL-3).

---

## ✅ OQ-2 / RISK-1 — RESOLVED 2026-07-16 by measurement: the perf gate DID fail, and the fix was the design

**It failed exactly as predicted** — `918 > 900` REST, `919 > 900` MCP. Per `thresholds.json:3` the
number was **not** touched; the measurement was taken to the operator with a per-field breakdown.

**The arithmetic in D7 was wrong about the cause, and measuring said so.** D7 blamed the label
(~90 tokens). Measured on a 10-result answer (`estimateTokens`, the counter the gate itself uses):

| default fields | tokens | vs 900 |
|---|---|---|
| `ref` `score` `signals` (today) | 734 | — |
| `+ label` | 824 | +90 |
| `+ kind` | 859 | +35 |
| `+ node` | **994** | **+135 — the real culprit** |

`node` is the dearest field **and it restates the label**: `node.key` is the label's path with the
extension stripped (`fileNodeKey`). The shape was shipping the same path twice per hit.

**Operator decision: label-only by default.** The contract line is now *"the default is what makes a
hit an **answer**; the extras are **depth** you ask for"* — so `RetrievalQuery.snippet` became
`RetrievalQuery.include { kind?, node?, snippet? }`, all opt-in, with each field's measured token cost
written into the OpenAPI/MCP descriptions so a caller can choose knowingly.

**Re-measured after the change: `search rest=783 mcp=783` — gate PASSES, 117 tokens spare (13%).**
The real corpus's label costs **56** tokens, not the 90 the synthetic predicted, and `search tokens
+7.7%` vs baseline confirms labels really are on the wire. F-073 is fixed **by default on both
surfaces**, and no threshold moved.

**Consequences for the increments below:** D6 (snippet opt-in) generalizes to all three extras. D7
("label and kind ALWAYS ON") is **superseded** — only `label` is always on. D9's client-side kind
filter and D13's "show effects" both require the dashboard to pass `include`; increments 4-5 must send
`include: { kind: true, node: true, snippet: {} }` (a human UI pays no token budget).

---

## ⏸️ RESUME HERE — session interrupted 2026-07-16 (tooling outage, NOT a blocked design)

> **Superseded 2026-07-16** — the outage ended, everything below was verified, and increments 1-3 are
> committed. Kept as the record of what was and was not proven at the time. Current state: the
> backend (enrichment + snippet + `/v1/search` `include` + MCP + SDK) is **done and green**; the web
> work (increments 4-6) is next.

The shell became unavailable mid-increment (the harness could not classify Bash/PowerShell calls), so
**work stopped rather than pile up unverifiable code**. Nothing below is guesswork about intent — it
is a factual account of what is on disk and what has actually been run.

**Verified green before the outage:**
- `pnpm -w typecheck` — 38/38, after the retrieval type additions + the `local.ts` wiring.
- `packages/config/src/sources/search-snippet.test.ts` — **14/14 passing**.

**On disk, NOT yet verified (no test/typecheck has run against these):**
- `packages/retrieval/src/domain.ts` — `RetrievalQuery.snippet?`; `FusedCandidate.kind?/snippet?/node?`;
  new `Snippet`/`SnippetMatch`/`SnippetRequest`/`CandidateNode` types. *(typechecked ✅)*
- `packages/config/src/sources/search-snippet.ts` *(tested ✅)*
- `packages/config/src/sources/search-enrichment.ts` — **test file written, NEVER RUN.**
- `packages/config/src/sources/search-enrichment.test.ts` — **NEVER RUN.**
- `packages/config/src/index.ts`, `packages/config/src/profiles/local.ts` *(typechecked ✅)*
- `apps/api/src/schemas/search.ts`, `apps/api/src/routes/v1/search.ts` — **not typechecked.**
- `apps/mcp/src/schemas.ts`, `apps/mcp/src/server.ts` — **not typechecked.**
- `apps/web/lib/api/types.ts`, `apps/web/components/search/snippet.tsx` — **not typechecked.**

**A correction to this plan, found while implementing:** `fuse.ts` needs **no change**. The plan said
to carry `kind`/`node` first-wins through fusion, but `createEnrichedRetriever` wraps
`HybridRetriever` and therefore decorates **`FusedCandidate`s post-fusion** — fusion never sees the
new fields. `Candidate` is untouched, so **E-012 stays purely type-only** (a smaller blast radius than
planned). `fuse.ts` and its tests must stay unmodified.

**Do this first, in this order, when resuming:**
1. `pnpm -w typecheck` — the api/mcp/web edits above have never been compiled.
2. `npx vitest run --root packages/config src/sources/search-enrichment.test.ts`.
3. **The increment-2 perf checkpoint below. Do not skip it and do not start the UI before it.**

**Still to do:** increments 2 → 6 (perf checkpoint, SDK regeneration, the `search-view` rewrite, the
detail Sheet, keyboard nav, the Inspector `?task=` seed + its `<Suspense>`, e2e, screenshots, and the
close-out incl. **F-073 → done**).

---

## Approach — verifiable increments

Each increment ends green on `pnpm -w typecheck && pnpm -w lint && pnpm -w test`.

**0. OQ-1 → operator.** Fold F-073 or not. **Blocks increments 1-6** (it decides whether `label` is
populated, and therefore whether "show effects" and the task seed can exist at all). No ADR required
either way — F-073 deviates from no default; it populates a declared field.

**1. Snippet extractor + enrichment decorator** (no HTTP yet).
`packages/config/src/sources/search-snippet.ts` (`extractSnippet`, reusing `extractTerms`);
`packages/config/src/sources/search-enrichment.ts` (`createEnrichedRetriever`);
`packages/retrieval/src/domain.ts` optional fields (D2); wire into `local.ts:236-248`.
✅ Verify: `pnpm -w test` — unit tests for the extractor (contiguous window, offsets land on real term
boundaries, no-match fallback, `maxChars` never exceeded, CRLF, unicode) and the decorator (label from
`metadata.path`; title from memory `metadata.title`; kind derivation incl. the no-fragment→symbol case;
tenant view rebinding; a ref with no fragment is passed through **unchanged, not dropped**).

**2. ⚠️ MEASURE THE PERF GATE.** `pnpm -w bench` with label+kind always-on, snippet off.
✅ Verify: `tokensPerAnswer.searchRest` and `searchMcp` **< 900**, and `latencyMs.searchP95` < 300.
**If searchRest ≥ 900 → STOP and escalate to the operator (D7). Do not touch `thresholds.json`.**
This is a hard checkpoint, deliberately placed *before* any UI work depends on the shape.

**3. `POST /v1/search` + MCP + SDK.**
`apps/api/src/schemas/search.ts` (+`snippet` request, +`snippet`/`kind`/`node` response, all optional);
`routes/v1/search.ts` passes the flag through; `apps/mcp/src/schemas.ts:15-18` (+`snippet`);
`pnpm --filter @tessera/sdk generate` → commit `openapi.json` + `src/generated/schema.ts`; re-export
any new type from `packages/sdk/src/index.ts` (the F-060 trap).
✅ Verify: api e2e (default response has no `snippet`; `snippet:true` returns text+offsets; offsets
index real matches; `label` is a path; tenant A ≠ tenant B); mcp e2e (`search` still in the tool set,
`gateway.test.ts` green **unmodified**); `pnpm --filter @tessera/sdk generate` produces **no diff**.

**4. Web — results list: excerpts, highlighting, kind filters, counts, virtualization.**
`apps/web/lib/api/types.ts` (mirror), `lib/api/hooks.ts` (`useSearch` passes `snippet`),
`components/search/search-view.tsx` (rewrite), new `components/search/snippet.tsx` (offset→`<mark>`),
`components/search/result-card.tsx`.
✅ Verify: RTL (excerpt renders; `<mark>` lands on the right substring; **a snippet containing
`<script>` renders as text, not markup** — the XSS regression test; kind filter + counts; the
"no memories *in these results*" copy); `contrast.test.ts` green with the `<mark>` token pair
registered.

**5. Web — detail Sheet: provenance, actions, keyboard nav.**
`components/search/search-detail.tsx` (Sheet; expanded `SignalContribution`s; memory body via the
existing `api.getMemory`; inline `useEffects`); `components/inspector/inspector-view.tsx` +
`app/inspector/page.tsx` (`?task=` + Suspense).
✅ Verify: RTL (Sheet opens on Enter; provenance rank/score/weight visible **without hover**;
"show effects" absent when `node` is undefined; Inspector prefills from `?task=` and **does not
auto-compile**); keyboard tests (↑/↓/Home/End/Enter/Esc; `aria-activedescendant` tracks; **the active
row is scrolled into view and present in the DOM** — D11's trap).

**6. e2e + screenshots + record.**
`apps/web/tests/e2e/search.spec.ts` (excerpt, highlight, filter, keyboard, axe AA);
`tests/e2e-full/tests/human-journey.spec.ts:38-42` (**assert a readable path** — F-073's acceptance);
`tests/e2e-full/tests/agent-journey.spec.ts:74-76` (assert a label, keeping the signal assertion);
screenshots across 4 themes × 2 modes; effects.json, progress.md, feature_list.json.

## Files to touch

**Retrieval (D2) — type-only, additive**
- `packages/retrieval/src/domain.ts` — `RetrievalQuery.snippet?`; `FusedCandidate.kind?/snippet?/node?`.
- `packages/retrieval/src/fusion/fuse.ts` — carry `kind`/`node` first-wins alongside `label` (:62-66).
- `packages/retrieval/src/index.ts` — export the new types.

**Composition root (D1) — the heart**
- `packages/config/src/sources/search-snippet.ts` — **new**, `extractSnippet` (+ test).
- `packages/config/src/sources/search-enrichment.ts` — **new**, `createEnrichedRetriever` (+ test).
- `packages/config/src/index.ts` — export both (mirroring :19-21).
- `packages/config/src/profiles/local.ts` — wrap `search` at :236-248 before it reaches `services`.

**API / MCP / SDK**
- `apps/api/src/schemas/search.ts` — additive request + response fields.
- `apps/api/src/routes/v1/search.ts:21-28` — thread `snippet` into `RetrievalQuery`.
- `apps/mcp/src/schemas.ts:15-18` — `searchShape` + `snippet` (no tool added).
- `packages/sdk/openapi.json`, `packages/sdk/src/generated/schema.ts` — **regenerated, committed**.
- `packages/sdk/src/index.ts:10-47` — re-export any new type (F-060's trap).
- `apps/api/tests/e2e/*search*` — new cases.

**Web**
- `apps/web/lib/api/types.ts:17-40` — mirror the new fields.
- `apps/web/lib/api/hooks.ts:19-27` — `useSearch(query, {snippet})`; key includes the flag.
- `apps/web/components/search/search-view.tsx` — **the rewrite** (the `label ?? ref` at :80 dies here).
- `apps/web/components/search/{result-card,snippet,search-detail}.tsx` (+ tests) — **new**.
- `apps/web/components/inspector/inspector-view.tsx:22` + `apps/web/app/inspector/page.tsx` — `?task=`
  seed + **Suspense**.
- `apps/web/tests/e2e/search.spec.ts` — rewritten.
- `apps/web/tests/contrast.test.ts` — register the `<mark>` token pair.
- **NOT** `apps/web/tests/e2e/support/fixtures.ts` — verified: no new permission.

**e2e-full / state**
- `tests/e2e-full/tests/human-journey.spec.ts:38-42`, `tests/e2e-full/tests/agent-journey.spec.ts:74-76`.
- `.harness/state/{effects.json,progress.md,feature_list.json}` (+ F-073 → done, if OQ-1 approved).

## Anticipated effects

- **E-003** (REST `/v1` + MCP contracts) — **primary.** `searchBodySchema`/`searchResponseSchema`
  gain optional fields ⇒ regenerate OpenAPI + `@tessera/sdk` (committed) ⇒ `apps/web/lib/api`.
  `searchShape` gains an optional arg. Additive (NFR-11); **no tool added** ⇒ `gateway.test.ts:34-49`
  and the mcp e2e tool-set assertions untouched.
- **E-012** (`Retriever`/`Candidate`/fusion) — `FusedCandidate` + `RetrievalQuery` gain optional
  fields; `fuse` carries them. **No port change, no adapter change, no conformance change** — the five
  retrievers are untouched. `RETRIEVER_KINDS` unchanged.
- **E-004** (design tokens / web) — new surfaces (result card, `<mark>` highlight, detail Sheet) are
  tokens-only across 4 themes × 2 modes; the `<mark>` pair must be **registered** in
  `apps/web/tests/contrast.test.ts`.
- **E-014** (`@tessera/config` composition root) — `local.ts` wraps `search`.
- **E-005** (gates) — **no gate config changes**, but the `perf` gate's *measured numbers move*
  (increment 2). `tests/bench/results/baseline.json` is re-recorded only if the gate passes; if it
  fails, escalate (D7) — never edit `thresholds.json`.
- **E-015** (`instrumentServices`) — **no new `ApiServices` member, deliberately** (D1). `search` is
  already forwarded + traced (`instrument-services.ts:60`). If a future revision adds a member, it
  MUST be forwarded there.
- **E-018** (auth/RBAC) — **untouched.** No new permission; `search:read`/`effects:read`/`memory:read`
  all already exist and are in the e2e fixtures.

## Test plan

- **Unit:** `extractSnippet` (contiguous window; offsets on real boundaries; no-match leading-window
  fallback; `maxChars` never exceeded; CRLF; unicode via `extractTerms`' `\p{L}` pattern; empty text).
  `createEnrichedRetriever` (label from `metadata.path`; memory title from `metadata.title`; kind
  derivation for all three cases; **a ref with no fragment passes through unchanged, not dropped**;
  `forTenant` rebinds; snippet only when requested). `fuse` (new fields merge first-wins; no ranking
  change — the existing fusion tests are the regression guard and must pass **unmodified**).
- **Integration (api e2e):** default response has **no** `snippet` and is shape-identical to today;
  `snippet:true` returns text + offsets that index real matches; `label` is a path for an ingested
  doc; tenant A's search never returns tenant B's refs or snippets; `limit` still honoured.
- **MCP e2e:** `search` returns the same labels REST does for the same tenant (ADR-0036 parity);
  the tool-name set assertion (`gateway.test.ts:34-49`) passes **unmodified**.
- **Perf (`pnpm -w bench`):** the gate checkpoint of increment 2. `searchRest`/`searchMcp` < 900 with
  the flag off; recorded in `results/baseline.json`.
- **RTL:** excerpt + highlight; **XSS regression — a snippet containing `<script>alert(1)</script>`
  renders as visible text with zero injected markup**; kind filter + honest counts; empty/skeleton/
  error; Sheet opens/closes; provenance visible without hover; actions absent when unavailable;
  Inspector prefills and does **not** auto-compile. Virtualizer stubbed per
  `memory-view.test.tsx:24-30`.
- **Keyboard:** ↑/↓/Home/End/Enter/Escape; `aria-activedescendant` tracks the active option **and that
  option exists in the DOM** after `scrollToIndex` (D11's trap); focus returns to the list on Sheet
  close.
- **E2E (web, axe):** WCAG A/AA clean on `/search` with the Sheet **open** (the Sheet is new a11y
  surface — axe must run with it open, not just on the list).
- **E2E-full:** `human-journey.spec.ts` asserts a **readable path** in the results (replacing the
  signal-only assertion at :38-42 — F-073's own acceptance clause); `agent-journey.spec.ts` asserts a
  label while **keeping** the keyword-signal assertion (it proves the hit came from the scanned
  fixture — do not lose that).
- **Screenshots:** `/search` with results + Sheet open, 4 themes × 2 modes, incl. reduced motion.

## Verification

Run in gate order ([`../verification/gates.json`](../verification/gates.json)); stop at first failure.
Feature-declared: `typecheck`, `lint`, `test`, `e2e`.

| Gate | Command | Evidence |
|---|---|---|
| state | `node scripts/verify-state.mjs` | this plan exists (:245-250); effects/schema sync |
| typecheck | `pnpm -w typecheck` | clean |
| lint | `pnpm -w lint` | clean (incl. package-boundary: web must NOT import `@tessera/ingestion`) |
| format | `pnpm -w format:check` | clean |
| test | `pnpm -w test` | unit + RTL + **contrast** (the `<mark>` pair) |
| build | `pnpm -w build` | clean — **catches the missing `<Suspense>` around `useSearchParams`** |
| e2e | `pnpm -w test:e2e` | api + mcp + web (axe AA with the Sheet open) |
| web-perf | `pnpm -w test:perf` | first-load JS budget — the Sheet + virtualizer must not blow it |
| e2e-full | `pnpm -w test:e2e:full` | **required** — search is on both journeys |
| **perf** | `pnpm -w bench` | **THE risk gate** — `searchRest`/`searchMcp` < 900 |

Also: `pnpm --filter @tessera/sdk generate` must produce **no diff** after commit.

## Scope limits & deferrals (stated, not hidden — the F-049/F-060 precedent)

1. **SL-1 — Snippets are opt-in; the default REST/MCP answer is unchanged.** Forced by the perf gate
   (Finding 5): any always-on snippet trips `tokensPerAnswer.searchRest` at 900. The dashboard opts
   in; agents choose. *Not a compromise — the correct design.*
2. **SL-2 — File BODIES are not served. The detail Sheet renders an excerpt for file results.**
   Acceptance #2 says "rendering the fragment/file/memory body". **Memory bodies ARE rendered in full**
   (via the existing tenant-scoped `api.getMemory`, `client.ts:83`). **File bodies are not**, because
   the only way to serve them is a `GET /v1/fragments/:ref` endpoint, and **the blob corpus is not
   tenant-partitioned** (`packages/storage/src/ports/blob.ts:5-16` — no `forTenant`; `putFragment`
   writes an unprefixed key). Such an endpoint would be a **cross-tenant IDOR** with derivable refs —
   the ADR-0050 class of defect, knowingly shipped. Doing it correctly means tenant-keying the corpus
   (`{tenantId}/{ref}`) + scoping the compiler's `FragmentSource` (`local.ts:246`) + a migration —
   a real feature, not a sub-task of a dashboard story. **Recommend registering it.** F-071 compounds
   it: ingestion writes to `DEFAULT_TENANT_ID`, so registry-derived ownership would not even agree
   with what search returns.
3. **SL-3 — "Show effects" covers FILE results only.** Memory results have no graph node. **Symbol
   results would need `{kind,key}` carried from `graph`/`symbolic` retrievers** (they hold the node at
   `graph-retriever.ts:47-49` / `symbolic-retriever.ts:38`) through fusion — ~6 additive lines,
   deliberately **deferred** to keep E-012 type-only this feature. The action is **absent**, never
   disabled-with-a-lie. Ironically the symbol case is the strongest effects story; register it.
4. **SL-4 — Duplicate rows for one file are now VISIBLE, and are not fixed here.** The same file has
   two refs (`documentIdFor` sha256 vs `nodeIdFor` sha256 — Finding 3); fusion keys on `ref` and cannot
   merge them. Today one row shows a hash and the other `ledger.ts`, so it looks like two things.
   **Labelling both makes the duplicate obvious.** Deduping post-fusion would corrupt ranks/scores;
   unifying the ref spaces is a retrieval-architecture change needing its own feature + ADR. **F-061
   surfaces this wart rather than papering over it** — that is the honest outcome.
5. **SL-5 — Acceptance criterion 3's "first real FR-49 virtualization" is FALSE.** F-041 shipped
   virtualization in `memory-view.tsx:157-203` with `@tanstack/react-virtual` already in
   `package.json:23`. Recorded as-built: this is the **second** virtualized list and the first
   **keyboard-navigable** one. (Same staleness class as F-060's "first `/v1/events` consumer".)
6. **SL-6 — Kind filtering + counts are client-side, over the returned result set** (D9), and labelled
   as such. Server-side kind filtering interacts with fusion's `limit` truncation and is not asked for.
7. **SL-7 — No deep-link to the graph.** `GraphView` has no URL state and a 500-node ceiling
   (`graph-view.tsx:20,42-43`) — a deep link would silently resolve to nothing. Effects render inline
   instead (D13). Adding URL state to the graph is F-042's surface.
8. **SL-8 — The Inspector seed prefills; it never auto-compiles** (D12). Compile spends budget and is
   entitlement-clamped.

## Risks / open questions

- **OQ-1 (OPERATOR DECISION, blocks increments 1-6): fold F-073 into F-061?** See the dedicated
  section. **Recommendation: yes.** Its effects are a subset, its mechanism is the same call, its wire
  change is zero, and two of F-061's own acceptance clauses ("show effects", "task seed") are
  unsatisfiable without it. If declined, F-061 ships with acceptance #2 partially unmet — recorded as
  unmet, not hidden.
- **RISK-1 (highest) — the `perf` gate may fail at increment 2.** `searchRest` has 173 tokens of
  headroom; `label` costs ~90 by arithmetic. If the real number lands ≥ 900: **escalate with the
  measurement.** Options are argue-the-threshold-up (ADR-grade) or make `label` opt-in. `thresholds.json:3`
  forbids the third option. **A threshold change must be argued, never quietly rebaselined.**
- **RISK-2 — golden rule 6.** `fuse()` is load-bearing for search *and* compile. Mitigation: the new
  fields are optional and merge exactly like `label` (:62-66); the existing `fuse.test.ts` and the
  retriever conformance suite must stay green **unmodified**.
- **RISK-3 — enrichment must never drop a result.** A ref with no fragment (every graph/symbolic hit —
  `resolve.ts:33-34` proves they resolve to `undefined`) must pass through **unchanged**. A naive
  `filter(Boolean)` would silently delete the graph signal from search. Explicit test.
- **RISK-4 — `aria-activedescendant` + virtualization** (D11): the referenced node must exist. Visually
  fine, silent for screen readers. Explicit test.
- **RISK-5 — `next build` breaks on `useSearchParams` without `<Suspense>`** (Finding 10). Caught only
  at the `build` gate, late. Do it in increment 5, not at the end.
- **RISK-6 — the `types.ts` mirror.** `apps/web/lib/api/types.ts:17-40` is a hand-maintained mirror
  (ADR-0022) while `client.ts:29-37` pulls newer types from the SDK (ADR-0048). Adding `snippet` in
  one and not the other typechecks but renders nothing. Update both; note the debt.
- **RISK-7 — e2e-full assertion strength.** When swapping `agent-journey.spec.ts:74-76` to assert a
  label, **keep** the keyword-signal assertion: it is the only thing proving the hit came from the
  scanned fixture rather than a vector-search nearest-neighbour (which has no relevance floor). Do not
  trade a strong assertion for a prettier one.
