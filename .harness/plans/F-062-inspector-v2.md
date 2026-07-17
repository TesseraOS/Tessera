# Plan: F-062 Dashboard: Inspector v2 — honest empty guidance, agent-ready export, compile filters & presets

- **Feature:** F-062 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-44, FR-32, FR-29 (from [`../../docs/PRD.md`](../../docs/PRD.md))
- **Service / package:** apps/web (**only** — see "Anticipated effects")
- **Author:** planner subagent + Claude Opus 4.8 · **Date:** 2026-07-17
- **Status:** in_progress

## Intent

Make the Inspector tell the truth when it finds nothing, and make what it finds portable. **Done** = compiling against an empty corpus produces *guidance* instead of three green progress bars; a compiled package can be copied as citation-preserving Markdown or downloaded as JSON in one click; and the compile form exposes the kind filters and budget presets that already exist on the wire, saying so out loud when the plan clamps the budget.

## Requirements — what they actually say

- **FR-44** (`docs/PRD.md:209`): "**Context Package inspector** (the "why" debugger): stages, scores, sources." Pri M, Rel R0.
- **FR-32** (`docs/PRD.md:189`): "**Explainability**: per-fragment "why included" (signals, scores) retrievable." Pri M, Rel R0.
- **FR-29** (`docs/PRD.md:186`): "**Token-budget aware**: never exceed a requested budget; degrade gracefully." Pri M, Rel R0.

None of the three mentions export, presets, or a recent list. FR-29's "**never exceed a requested budget**" is the interesting one: the entitlement clamp means the product sometimes *silently substitutes a different budget than the one requested*, which is adjacent to FR-29's promise and is exactly what acceptance 3 wants surfaced. The acceptance in `feature_list.json` is the binding contract; §Scope limits records where it cannot be met truthfully.

---

## Findings (verified against the tree — paths + lines)

### 1. ✅ The premise is TRUE. The "100% / 0 fragments" bug is real and still there.

Both prior features found a stale premise in their acceptance (F-060's "first `/v1/events` consumer" was the third; F-061's "first real virtualization" was the second). **F-062's premise checks out.** Verified by reading the code path end to end:

- `packages/context-compiler/src/scores.ts:16-19` — the origin:
  ```ts
  const fragmentCount = fragments.length;                                        // 0
  const budgetAdherence = totalTokens <= budget ? 1 : budget <= 0 ? 0 : budget / totalTokens;  // 0 <= 2000 → 1
  const provenanceCoverage = fragmentCount === 0 ? 1 : withProvenance / fragmentCount;         // explicit → 1
  ```
  `redundancy = pairs === 0 ? 0 : …` (`:34`) → **0**, which renders as "0%" and reads as *ideal*.
- `packages/context-compiler/src/stages/assemble.ts:91,94` — `sections: sectionsByKind([])` → `[]`; `scores: computePackageScores([], budget, 0)`.
- `apps/web/components/inspector/inspector-view.tsx:126-137` — renders **all three `ScoreBar`s unconditionally**, then `{pkg.scores.fragmentCount} fragments · {pkg.totalTokens} / {pkg.budget} tokens`.
- `apps/web/components/provenance/score-bar.tsx:13,18,28` — `pct = round(clamp(value)*100)` → `100%` text, `aria-valuenow={100}`, and a `bg-primary` bar filled to `width: 100%`.

⇒ An empty compile renders **"Budget adherence 100% · Provenance coverage 100% · Redundancy 0% · 0 fragments · 0 / 2000 tokens"**, three full/ideal progress bars, **zero section cards**, then the trace. There is **no empty-package branch anywhere** in `PackageView` (`:117-247`). Confirmed exactly as reported.

### 2. `fragmentCount` is a REAL field, all the way to the client. No derivation needed.

`PackageScores.fragmentCount` — `packages/context-compiler/src/domain.ts:80` → `apps/api/src/schemas/compile.ts:50` (`fragmentCount: z.number().int()`) → `apps/web/lib/api/types.ts:130`. The acceptance's "scores render only when fragmentCount > 0" is directly implementable against a first-class field.

### 3. The exact `ContextPackage` shape on the wire

`packages/context-compiler/src/domain.ts:90-97` ⇄ `apps/api/src/schemas/compile.ts:57-64` ⇄ `apps/web/lib/api/types.ts:136-143` (all three agree):

```
ContextPackage { task, budget, sections[], totalTokens, trace, scores }
  ContextSection  { title, fragments[] }              // title IS the fragment kind — assemble.ts:64
  ContextFragment { ref, text, kind, tokens, score, provenance, whyIncluded }
    FragmentProvenance { retrievalScore, signals[], expandedFrom?, source? }
  CompilationTrace { stages[] }
    TraceStage { stage, inputCount, outputCount, dropped[], notes? }   // durationMs NOT on the wire
  PackageScores { fragmentCount, budgetAdherence, provenanceCoverage, redundancy }
```

Two details that matter:
- **`section.title` is the kind**, not a heading (`assemble.ts:54-64` groups `byKind`, `title` = kind, sections sorted by max fragment score). So the Markdown export's section headers are `code` / `markdown` / `text` / `memory`.
- **`TraceStage.durationMs` exists in the domain (`domain.ts:70`) but is NOT in `traceStageSchema` (`compile.ts:39-45`)** — it is dropped at the wire. Do not plan to render timings.

### 4. 🔑 The readable path is ALREADY on the compile wire — the Inspector just doesn't use it

- `apps/api/src/schemas/common.ts:28` — `metadataSchema = z.record(z.string(), z.unknown())` — free-form, passes through.
- `apps/api/src/schemas/compile.ts:19` — `source: metadataSchema.optional()` on `fragmentProvenanceSchema`.
- `packages/context-compiler/src/stages/assemble.ts:49` — `provenance: buildProvenance(candidate, fragment.metadata)` → `source: fragment.metadata`.
- `packages/config/src/sources/ingestion-sink.ts:30` — every ingested doc is written with `metadata: { ...document.metadata, sourceId: document.source.id, path: document.path }`.
- `packages/config/src/sources/memory-indexing.ts:36` — every memory with `metadata: { lineageId, kind, title }`.
- `packages/config/src/fragment-source.ts:20-26, 51-55` — metadata **round-trips** through the blob corpus (`putFragment` stores it, `createBlobFragmentSource.get` restores it).

⇒ **`fragment.provenance.source.path` is a real path on the wire today**, and `provenance.source.title` is a memory's title. Meanwhile `inspector-view.tsx:156-158` renders `{fragment.ref}` — which for real ingested content is `documentIdFor(sourceId, path) = sha256(...)`, a **64-char hash**.

**F-073's disease survives in the Inspector**, and the cure needs **zero contract change** this time (F-061 needed a whole enrichment decorator; the compiler already forwards metadata). Proof it is live: `tests/e2e-full/tests/human-journey.spec.ts:48` asserts `/^[0-9a-f]{64}$/` has **count 0** — but only while on `/search` (`:38`). Step 4 (`:53-61`) then drives the Inspector over the *same real fixture corpus* and asserts only the trace + prose. Nobody has ever looked at the Inspector's citations.

### 5. 🔑 The entitlement clamp is SILENT — but the response already carries enough. Zero API change.

- `apps/api/src/routes/v1/compile.ts:41` — `budget: clampBudgetToPlan(entitlements, budget)`, over `services.billing ?? createLocalBilling()` (`:21`) so free-tier limits apply by default (`:19-20`).
- `packages/billing/src/domain.ts:98-101` — `clampBudgetToPlan` = `max < 0 ? requested : Math.min(requested, max)`. **Never signals that it clamped.**
- Caps (`domain.ts:38,45,53`): free **8000**, pro **32000**, enterprise **128000**.

**But the clamped value comes back.** `compile.ts:39-46` builds `compileRequest` with the *clamped* budget → `compiler.compile(compileRequest)` → `assemble.ts:90` sets `budget: request.budget`. So **`pkg.budget` IS the effective (clamped) budget**, and the client knows what it *asked* for because it sent it.

⇒ `requested > pkg.budget` ⟺ **clamped**. Detectable client-side with **no additive field, no SDK regen, no E-003, no perf cost.** The brief's hypothesis ("that is an additive API change (E-003 + SDK regen)") is **wrong** — verified. TanStack Query even hands us the requested value for free: `useCompile()` is a `useMutation` (`hooks.ts:45-49`), and `mutation.variables` holds the last submitted body.

What the response *cannot* tell us: **which plan** produced the cap. `GET /v1/billing/subscription` requires **`admin:manage`** (`routes/v1/billing.ts:44`), so a viewer/member cannot learn their own plan. `GET /v1/billing/plans` is **public** (`:31`) and returns every plan's `maxTokensPerCompile` — but not *which one is yours*. ⇒ The UI can honestly say **"this compile was capped at 8,000"**; it cannot say **"your Pro plan caps you at 32,000"** without an admin-only call. That shapes the copy (D6).

### 6. 🔴 The MCP surface does NOT enforce the clamp — an entitlement bypass (OQ-1)

- `apps/mcp/src/server.ts:203-207` — `compile_context` → `services.compiler.forTenant(tenantOf(ctx)).compile(toCompileRequest(args))`.
- `apps/mcp/src/server.ts:350-358` — `explain` → the same, with `budget: args.budget ?? DEFAULT_EXPLAIN_BUDGET`.
- `apps/mcp/src/server.ts:123-138` — `toCompileRequest` passes **`budget: args.budget` straight through**.
- **`@tessera/billing` is not imported by `apps/mcp/src/server.ts` at all.**

⇒ REST enforces NFR-12's plan cap; **MCP does not**. An agent asks `compile_context` for `budget: 1_000_000` and gets it. This is F-035's own requirement unenforced on the surface agents actually use, and it is structurally the F-060 defect (one surface hardened, its twin walked past) and the F-061 lesson (two implementations of one rule drift). See OQ-1.

### 7. `CompileRequest` kind filters: an OPEN string, on a vocabulary with NO source of truth

- `apps/api/src/schemas/compile.ts:9-12` — `filters: z.object({ kinds: z.array(z.string().min(1)).optional() }).optional()`.
- `apps/mcp/src/schemas.ts:49-52` — `filtersShape`, **identical** open shape.
- `packages/context-compiler/src/compiler.ts:30` — the compiler's own `requestSchema`, identical again.
- `packages/context-compiler/src/domain.ts:4-7` — `ContextFilters { kinds?: readonly string[] }`, comment "e.g. `'code'`, `'memory'`".

**What values actually work** — `resolve.ts:25,35` compares against `fragment.kind`, the raw corpus kind:

| value | written by | evidence |
|---|---|---|
| `code`, `markdown`, `text` | ingestion | `packages/ingestion/src/domain.ts:54` — `DocumentKind = 'code'\|'markdown'\|'text'\|'binary'`; `pipeline/decode.ts:54` classifies |
| `binary` | **never indexed** | `ingestion-sink.ts:24` — `if (document.kind === 'binary') return;` |
| `memory` | memory capture | `memory-indexing.ts:34` |

**There is NO exported runtime constant for this vocabulary.** `DocumentKind` is a bare `type` (no `DOCUMENT_KINDS` array). And **`RETRIEVER_KINDS` is the wrong axis entirely** — `packages/retrieval/src/domain.ts:2` is `['semantic','keyword','graph','symbolic','temporal']`, i.e. *signals*, not fragment kinds. Deriving the compile filter from it would be a category error.

Two more traps here:
- **The search kind vocabulary is DIFFERENT.** F-061's `ResultKind = 'file'|'memory'|'symbol'` (`packages/config/src/sources/search-enrichment.ts:29`) is a *derived* display taxonomy. Putting `file` into `filters.kinds` matches **nothing** — `resolve.ts:35` compares against `code`/`markdown`/`text`/`memory`. The two must not be confused.
- **The filter is applied AFTER retrieval** (`compiler.ts:174` — resolve runs after retrieve/expand/rank). Filtering to `memory` does **not** retrieve more memories; it drops non-memories from the already-retrieved ~20/need. So a kind filter can legitimately yield **zero fragments** even when memories exist — which lands straight in acceptance 1's guidance state. The two acceptance clauses interlock.

**Precedent for the honest resolution:** `apps/web/lib/api/types.ts` already carries **three** documented hand-mirrors of exactly this kind — `MEMORY_KINDS` (`:150-158`), `NODE_KINDS` (`:361-368`), and `REGISTERABLE_SOURCE_KINDS` (`:279-282`), the last with a doc comment explaining precisely which values are real and why one is excluded. That is the established pattern (D5).

### 8. ⚠️ The `perf` gate premise in my brief is WRONG — it is a RATIO, not a 4000 ceiling

`tests/bench/thresholds.json:22-36` defines exactly **three** `tokensPerAnswer` gates: `searchRest` (900), `searchMcp` (900), and **`compileEnvelopeRatio` (max 1.9)**. There is **no `compileRest`/`compileMcp` threshold and no `4000` anywhere.**

`compileRest: 3373` / `compileMcp: 3411` (`tests/bench/results/baseline.json:39-40`) are **recorded measurements, not gated numbers**. `tests/bench/bench.mjs:342-350` gates only `compileEnvelopeRatioRest`/`Mcp` against `compileEnvelopeRatio.max`. The ratio (`bench.mjs:215-216`) is `compileTokens / packageTokens`:

| metric | measured | ceiling | real headroom |
|---|---|---|---|
| `compileEnvelopeRatioRest` | **1.61** | 1.9 | 1.9 × 2098 = **3986** ⇒ **613 tokens** |
| `compileEnvelopeRatioMcp` | **1.63** | 1.9 | ⇒ **575 tokens** |

(`packageTokens: 2098`, `baseline.json:41`.) The brief's "~600 tokens of headroom" is numerically right by coincidence — 1.9 × 2098 ≈ 3986 ≈ 4000 — but the *mechanism* matters: **headroom scales with package size**, so a fixed-cost field is proportionally dearer on a small package. Recording this because the next person will otherwise "fix" a ratio failure by editing the wrong number.

⇒ **Does F-062 fatten the compile response? No — not one byte, under this design.** Every clause is satisfiable from data already on the wire (Findings 2, 4, 5). The `perf` gate should not move. That is the single strongest argument that this design is correct, and it is why the measure-per-field lesson does not bite here: **there is nothing to measure, because nothing is added.** If any increment finds itself reaching for an additive response field, that is the signal to **stop and re-read this section**, then measure per-field before arguing anything.

### 9. Export: nothing to reuse. `explain` is the wrong shape and the wrong place.

- **No Markdown serializer of a package exists anywhere.** A repo-wide grep for `toMarkdown|renderMarkdown` across `packages/**/src` returns only `DocumentKind = 'markdown'` *classification* hits (`decode.ts`, `ingestion/domain.ts`, `corpus-indexer.ts`, `fragment-source.ts`).
- **`apps/mcp/src/explain.ts:35-65` (`buildExplanation`) is not reusable, twice over.** It lives in `apps/mcp` (`apps/web` cannot import it), and its whole purpose is the **opposite** of an agent-ready export: it is "provenance + trace, **no fragment bodies**" (`:21`) — it deliberately strips `text` (`:39-46`). An export whose point is to hand an agent the *content* cannot be built on a projection that removes it.
- **Clipboard: exactly ONE existing usage in the whole app** — `apps/web/components/profile/tokens-panel.tsx:225-230`:
  ```ts
  const copySecret = async () => {
    if (created === null) return;
    await navigator.clipboard.writeText(created.secret);   // ← unguarded: rejects on insecure context / denied permission
    setCopied(true);
    toast.success('Secret copied to clipboard');
  };
  ```
  The pattern (`writeText` + `sonner` toast) is the precedent; the **missing rejection handling is a latent bug** (an unhandled promise rejection, and `setCopied` never runs). Not F-062's to fix, but the new code must not copy the flaw (D4).
- **No download precedent exists** anywhere in `apps/web`.

### 10. Session stores: the pattern is excellent — and its documented sign-out clear is NOT WIRED

- `apps/web/lib/store/notifications.ts` is the template: a pure exported `appendEntry` (`:39-45`) so "the state math unit-tests without a socket" (`:38`), a `FEED_LIMIT` cap (`:16`), and an explicit honesty doc — *"Live-session only, by design… The UI must therefore never imply history it does not have"* (`:8-12`). `lib/store/command.ts` is the minimal Zustand precedent.
- `notifications.ts:34-35` declares: *"`clear`: Drop everything — **used on sign-out** so one user's activity never bleeds into the next session."*
- **It is never called in production code.** A repo-wide grep for `.clear()` in `apps/web` returns only `activity-feed.test.tsx:77`, `notifications.test.ts:30,59`, and an unrelated `localStorage.clear()`. `apps/web/lib/auth/use-session.tsx:96-99` (`signOut`) does `fetch(DELETE)` + `invalidateQueries` and **touches no store**.

⇒ The intent is documented and unimplemented. F-062 adds a **second** session store holding **user-authored task text** ("fix the auth bypass in payments"). Shipping it unclearing *doubles* the gap. See D8.

### 11. Conventions, gates, and every trap the brief asked about — checked

- **E-015 `instrumentServices` trap: N/A, structurally.** This design adds **no `ApiServices` member** — it adds no server code at all. `packages/observability/src/instrument-services.ts` is untouched.
- **SDK regen: NOT NEEDED.** No wire change ⇒ no `pnpm --filter @tessera/sdk generate`, no `openapi.json`/`src/generated/schema.ts` diff, no `packages/sdk/src/index.ts` re-export. (`apps/web/lib/api/client.ts:79` — `compile: (body: CompileBody): Promise<ContextPackage> => sdk.compile(body)` — already types compile from the hand-mirror, not the SDK.) The generate-produces-no-diff check still runs as a guard.
- **MCP tool-name assertions: SAFE. We add no tool.** `apps/mcp/src/gateway.test.ts:34-49` pins the exact sorted set of **14** tools; `compile_context` and `explain` are already in it. Export is client-side (D3) ⇒ untouched.
- **e2e permission fixtures: NO change needed.** `apps/web/tests/e2e/support/fixtures.ts:14` (`LOCAL_IDENTITY`) and `:31` (`LOCAL_RBAC`) already carry **`compile:read`**, and `:21`/`:38` already carry **`stats:read`** (F-060). Like F-061, unlike F-060 — verified, not assumed.
- **Data flow:** `apps/web/.harness/rules/frontend.md:7-8` — SDK + TanStack Query only. `:13-16` is worth quoting, because it is this exact surface: *"The **Context Package inspector** (FR-44) is a flagship surface: render the compilation trace — stages, candidates, scores, drops, and per-fragment 'why included.' Any view that shows context must show its provenance."*
- **Design tokens:** `docs/design/DESIGN-SYSTEM.md` (ADR-0009/0021/0047), 4 themes × 2 modes; `apps/web/tests/contrast.test.ts:10-18` — *"New token pairs used as text must be added to the registry in the same change"*, and *"If a case fails: FIX THE TOKEN … never this file's thresholds."*
- **`EmptyState` already has an `action?: ReactNode` slot** (`apps/web/components/empty-state.tsx:16,54`) plus `art`/`mascot` — the guidance state needs no new primitive.
- **F-061's `?task=` seed + `<Suspense>` must not regress.** `apps/web/app/inspector/page.tsx:9-14` carries the load-bearing comment (*"Required, not decorative … next build fails on a client component that [reads `useSearchParams`] outside a Suspense boundary"*); `inspector-view.tsx:23-27` seeds `useState(() => searchParams.get('task') ?? '')`; `inspector-view.test.tsx:9-10,67-77` pins **prefill-without-auto-compile**. All three stay.
- **e2e-full drives this exact form.** `tests/e2e-full/tests/human-journey.spec.ts:55-57`:
  ```ts
  await page.getByLabel('Task description').fill(`How does the ${FIXTURE_TERM} ledger work?`);
  await page.getByLabel('Token budget').fill('2000');
  await page.getByRole('button', { name: 'Compile' }).click();
  ```
  ⇒ **`Token budget` must remain a labelled, fillable input.** Presets *augment* it (D7). Breaking this is golden rule 6.
- `scripts/verify-state.mjs:245-250` requires `.harness/plans/F-062-*.md` while `in_progress`. All **11** gates in `.harness/verification/gates.json` are `active`.

---

## ✅ OQ-1 — RESOLVED 2026-07-17: REGISTER (as **F-077**), do not fold. The harness answers this one.

**Independently verified before deciding** (not taken on the planner's word): `apps/api/src/routes/v1/compile.ts:41` clamps via `clampBudgetToPlan(entitlements, budget)`; `apps/mcp/src/server.ts` contains **zero** matches for `billing|clampBudget`, and `toCompileRequest` (`:123-138`) forwards `budget: args.budget` verbatim to `compile_context` and `explain`. The bypass is real.

**Decision: register it as F-077 (`must`, R4) and keep F-062 a web feature.** This is not a judgement call the operator needed to make — **the harness already answers it**, and the answer differs from F-060's only because the *reason* for F-060's fold is absent here:

- **Golden rule 2 forbids scope creep**, and the **F-048 precedent** registered *three* findings (F-071/072/073) rather than fixing them.
- **F-060's SSE fold was the exception, justified by AMPLIFICATION** — that feature was about to pipe leaked data onto every page, so shipping it would have made a latent leak a rendered one. **F-062 does not amplify this bypass**: it renders a claim about the REST surface, which is true of the surface it describes. The bug is exactly as bad the day before F-062 as the day after.
- It is a **different service** (`apps/mcp` + billing wiring) with its own acceptance and its own e2e.
- It changes **existing verified agent behaviour** (golden rule 6): an agent getting 32k today would start getting 8k.
- It carries a **genuine ADR question** — should MCP clamp *silently* (parity with REST) or **reject** with a ValidationError? Arguably an agent should be told rather than quietly downgraded, which loops back to whether REST should tell anyone either. That must not be smuggled into a dashboard story.

**The binding consequence for F-062, which this plan respects:** the UI **must not claim system-wide enforcement**. "Your plan caps compiles at 8,000 tokens" is *false* while MCP ignores it. The copy stays scoped to the observed fact — **"Capped to 8,000 tokens — you requested 20,000"** — which is true, provable from the response, and stays true whichever way F-077 is decided. Not a workaround: it is the more defensible sentence anyway, since a non-admin cannot learn their plan name regardless (`billing/subscription` needs `admin:manage`).

The original analysis follows.

## ⚠️ OQ-1 (original) — the MCP compile surface bypasses the F-035 clamp. Fold the fix, or register it?

**The defect (independently verified — Finding 6, not taken on report):** `apps/api/src/routes/v1/compile.ts:41` clamps; `apps/mcp/src/server.ts:206` and `:357` do not, and `toCompileRequest` (`:130-137`) forwards `budget` verbatim. `@tessera/billing` is not imported in the MCP server. NFR-12's per-plan `maxTokensPerCompile` is enforced on the human surface and unenforced on the agent surface.

**Recommendation: REGISTER it as its own feature; do NOT fold it into F-062.** This deviates from the F-060 precedent deliberately, and the difference is worth naming:

- **F-062 does not amplify it.** F-060 *had* to fix the SSE leak because it was about to pipe the leaked data onto every page. F-062 renders a claim about the REST surface, and that claim is **true of the surface it describes**. No user is misled by the dashboard; no data leaks. The bypass is a revenue/enforcement bug, and it is exactly as bad the day before F-062 as the day after.
- **It is a different service with a different acceptance.** F-062's `service` is `web`. This fix is `apps/mcp` + billing wiring + an MCP e2e proving an over-cap budget is clamped.
- **It changes existing verified agent behavior** (golden rule 6): an agent getting 32k today would start getting 8k.
- **It raises a genuine design question that deserves an ADR**: REST clamps *silently*; should MCP clamp silently too (parity of behavior), or **error** (`ValidationError`: "budget 1000000 exceeds your plan's 8000")? Arguably an agent should be *told*, not quietly downgraded — which loops back to whether REST should tell anyone either. That is ADR-grade and must not be smuggled into a dashboard story.

**The honest consequence for F-062, which the plan must respect:** the UI **must not claim system-wide enforcement**. "Your plan caps compiles at 8,000 tokens" would be *false* while MCP ignores it. So the copy is scoped to the observed fact — **"This compile was capped at 8,000 tokens by your plan (you requested 20,000)"** — a statement about *this compile*, which is true, verifiable from the response, and stays true whichever way OQ-1 is decided. This is not a workaround; it is the more defensible sentence anyway (Finding 5: we cannot name the plan for a non-admin regardless).

**If the operator folds it in instead:** F-062 gains a `must`-grade fix in `apps/mcp` (mirror `compile.ts:19-21,37,41` into `server.ts` for both `compile_context` and `explain`), an ADR for silent-vs-error, an MCP e2e, and a golden-rule-6 behavior change — and the UI copy can then honestly generalize. **Cost: F-062 stops being a web feature.** I recommend against, and recommend registering it as a `must` R4 sibling of F-071 with the ADR question attached.

---

## Design decisions (and their justification)

**D1 — The empty-package fix belongs in the UI. Do NOT touch the compiler.** *(The brief asked for a firm call: this is it.)*

`computePackageScores([], 2000, 0)` returning `{budgetAdherence: 1, provenanceCoverage: 1, redundancy: 0}` is **not false**. Every one of those is a defensible vacuous truth: the package did not exceed budget; 100% of zero fragments carry provenance; zero of zero pairs are duplicates. **The lie is not in the arithmetic — it is in rendering a vacuous truth as an achievement**: three `bg-primary` bars at 100/100/ideal, with `aria-valuenow={100}` announcing it to a screen reader.

- **The acceptance itself is a render rule**: *"package scores render only when fragmentCount > 0."* It says *render*, not *compute*.
- **Agents are not misled.** A REST/MCP caller receives `fragmentCount: 0` in the same object as `budgetAdherence: 1` and can see the denominator. The human is misled because the UI draws bars and hides the count in 10px mono text (`inspector-view.tsx:130-137`).
- **The compiler change would be enormous for zero user gain.** Making `PackageScores` fields optional/nullable is an **E-013 + E-003** contract change rippling into: `quality.ts:45-52` (`computeQuality` multiplies these into a CQS — null handling), `quality.test.ts`, `tests/integration/beats-naive.test.ts:31-32`, `cache.test.ts:12`, `apps/mcp/src/explain.ts:26` (`scores: ContextPackage['scores']`), `apps/api/src/schemas/compile.ts:49-54`, an SDK regen, and the bench. Against NFR-11 (additive-only) and golden rule 6.

⇒ **Acceptance 1 changes exactly one package: `apps/web`.** Recorded as SL-2: the vacuous 1.0s stay on the wire, and `computeQuality` will still hand an empty package a high CQS — a real (if latent) wart, flagged not fixed.

**D2 — The diagnosis rides STRUCTURED COUNTS and what the UI itself sent. Never parse a prose reason string.**

The brief rightly warns against inventing a diagnosis the data cannot support. Here is what the data *actually* supports. The trace is a funnel (`compiler.ts:117-212`): `plan → retrieve → expand → rank → resolve → dedup → compress → assemble`, each stage carrying integer `inputCount`/`outputCount` and a `dropped[]`. **Find the first stage whose `outputCount === 0`:**

| first zero | what it PROVES | what the UI can honestly say |
|---|---|---|
| `retrieve` | retrieval returned no candidates | "Retrieval matched nothing." **Cannot distinguish empty-corpus from no-match from the trace alone** — see below. |
| `resolve` (retrieve > 0) | every candidate was dropped resolving | Render `resolve.dropped[].reason` **verbatim** (already prose: `'no content for ref'` — `resolve.ts:34`; `` `filtered out kind '${fragment.kind}'` `` — `:36`). **If the UI sent `filters.kinds`, it knows its own filter is the suspect without parsing anything** → offer "Clear filters and retry". |
| `compress` (dedup > 0) | fragments existed but none fit | `compress.dropped[].reason` is already `` `exceeds budget (needs ${fullTokens} tokens, ${remaining} remaining)` `` (`compress.ts:86-89`) → "Raise the budget" + a preset. |

**Resolving "empty corpus vs. no match" — the one thing the trace cannot do — needs no new API either.** `useStats()` (F-060, `hooks.ts:113-136`, `stats:read`, already in the e2e fixtures) returns `{documents, memories, graph, sources, lastScanAt}`:

- `sources === 0` → **"No sources are connected"** → the acceptance's *link to Sources*, and it is a fact, not a guess.
- `sources > 0 && documents === 0` → **"Sources are registered but nothing is indexed yet"** → link to Sources / run a scan.
- `documents > 0` → **"N documents are indexed for your sources; this task matched none of them"** → suggest rephrasing.

Designed as a **progressive enhancement**: the guidance is correct and complete on the trace alone; stats *sharpen* it. If `useStats()` errors (a scoped token without `stats:read` → 403), the diagnosis silently falls back to trace-only. It must never block, never crash, never lie.

**Two honesty constraints on this, both mandatory:**
1. **The copy must match what the stat actually means.** Per F-060's SL-6, `documents` is counted via the tenant's *source registry* + manifest, and until **F-071** ingestion writes to `DEFAULT_TENANT_ID` — so in a non-default tenant it can report documents the tenant cannot actually search. Say **"indexed for your sources"** (what the number is), never "your corpus contains" (what it isn't). Accurate in zero-auth Local (the default, one tenant); stated as SL-1 for multi-tenant.
2. **Stage names are a soft contract.** `stage: 'retrieve'` etc. are string literals (`compiler.ts:118,136,149,168,175,183,195,207`) typed on the wire as `z.string()` (`compile.ts:40`) — **not an exported enum**. If a stage is renamed the guidance must degrade to a generic honest message ("This compile produced no fragments — see the trace below"), never crash and never mis-diagnose. Pinned by a unit test that feeds an unrecognised trace.

⇒ Implement as a **pure function** — `diagnoseEmptyPackage(pkg, { stats?, filtersApplied })` → a discriminated verdict — in `apps/web/lib/inspector/diagnose.ts`, so the whole matrix unit-tests with no render and no network (the `appendEntry` / `buildExplanation` "pure, unit-tested" precedent).

**D3 — Export is CLIENT-SIDE. This is where the ADR-0036 parity pattern does NOT apply.** *(A firm recommendation, as asked.)*

F-060 and F-061 both landed on "compute it once on the server so both surfaces agree". **That reasoning does not transfer, and the distinction is worth writing down:**

> The parity pattern applies when the server computes a **fact** the client would otherwise re-derive — and could re-derive *differently*. `computeWorkspaceStats` and the search `label` are facts: two implementations can **disagree about truth**. Markdown is not a fact. It is a **re-formatting of data the caller already holds, byte for byte**. There is no truth to disagree about.

Concretely, against the acceptance's own framing — *"the human↔agent handoff path"*:
- **An agent already has the package as JSON.** `compile_context` returns the full `ContextPackage`. Markdown would be a **lossier and fatter** encoding of what it already received — an agent asking for Markdown would pay *more* tokens for *less* structure. ADR-0036 says the agent surface must be no less **capable**; it is not less capable, it is strictly better served.
- **The consumer is a human's clipboard.** The Markdown exists so a person can paste a package into a chat box. That is presentation, and presentation belongs in the presentation layer.
- **A server export would cost real things for no consumer**: a new endpoint or `format` field → **E-003** → SDK regen → an MCP tool (breaking `gateway.test.ts:34-49`'s 14-tool assertion) → and it would fatten the compile envelope against the **1.9 ratio** (Finding 8) — all to serve nobody.
- **JSON download is `JSON.stringify(pkg)`** — literally the bytes the API already sent. A server round-trip for it would be self-parody.

⇒ `apps/web/lib/export/context-package.ts`, a **pure module** (`toMarkdown`, `toJson`, `citationOf`, `fragmentToMarkdown`), unit-tested without a DOM. **No reuse of `buildExplanation`** (Finding 9: wrong package, and it strips the very text the export exists to carry).

**D4 — The Markdown shape: citation-preserving, fence-safe, path-titled.**

```markdown
# Context: How does the Quernstone ledger work?

Compiled by Tessera · 3 fragments · 1,240 / 2,000 tokens.

## code

### src/reporting/ledger.ts
**Why included:** retrieved by keyword+semantic (score 0.842)
**Signals:** keyword, semantic · **Retrieval score:** 0.842 · **Tokens:** 312
**Ref:** `a3f8b2c9…`

```ts
export function appendEntry() { … }
```

## memory

### Ledger is append-only
**Why included:** pulled in as an effect-dependent of src/reporting/ledger.ts (score 0.610)
…
```

Decisions inside the shape, each load-bearing:
- **Sections come from `section.title`, which is the kind** (Finding 3). Not invented headings.
- **The heading is the CITATION, and the citation is a PATH** — `provenance.source.path` (files) / `provenance.source.title` (memories), falling back to `ref` (Finding 4). *"Citation-preserving" is meaningless if the citation is a sha256*: an agent cannot open `a3f8b2c9…`, and F-061's operator-approved line was exactly this — *"a 64-char hash is not an answer at any price."* The raw `ref` is still emitted on its own line, so nothing is lost.
- **`whyIncluded` is copied verbatim** — it is FR-32's own artifact and it already self-documents compression (`assemble.ts:39-42` appends *"compressed to fit budget (N→M tokens)"*). Free fidelity.
- **⚠️ Fence injection is the export's XSS.** Fragment text is **ingested repository content**, and `markdown` is a first-class `DocumentKind` — so fragment bodies **will** contain ``` fences. A naive triple-backtick wrapper produces structurally broken Markdown the moment a real `.md` file is compiled. Fix: scan the text for its longest backtick run and fence with **one more** (CommonMark's rule). Same discipline as F-061's offsets-not-HTML: **structurally correct, not hopefully correct.** Explicit test with a fragment containing ``` and ````.
- **The Markdown deliberately omits the trace.** The acceptance asks for "sections + refs + why-included". Clean split: **Markdown = what you paste into an agent; JSON = the complete record** (trace included, exactly as the API sent it).
- **Per-fragment copy emits that fragment's block** — heading + why-included + signals + fenced text — never the bare text. Otherwise "citation-preserving" is violated by the one action most likely to be used.

**D5 — Kind filters: a documented mirror in `types.ts`. Do NOT tighten the wire.**

The brief said "do NOT duplicate a catalog" and asked for the truth. **The truth is there is no catalog to derive from** (Finding 7): `DocumentKind` is a bare type with no runtime array, `'memory'` is a string literal in a decorator, and `RETRIEVER_KINDS` is a different axis. The options are:

| option | verdict |
|---|---|
| Derive from `RETRIEVER_KINDS` | ❌ **Category error.** Those are signals (`semantic`/`keyword`/…), not fragment kinds. |
| Tighten `filters.kinds` to `z.enum([...])` in api + mcp + compiler | ❌ **BREAKING.** Today `{kinds:['anything']}` returns 200 (and drops everything); an enum makes it a **400**. Violates NFR-11 additive-only + golden rule 6. Needs an ADR **and its own feature** — not a dashboard story. |
| New `DOCUMENT_KINDS` const + a package for the union incl. `'memory'` | ❌ For F-062. `apps/web` can't reach it anyway (`@tessera/ingestion` isn't a dep, and `@tessera/config` is a **devDependency** only — `package.json:49-50`), and the frontend rule says SDK-only. Real, but it's someone else's feature. |
| **Documented mirror in `apps/web/lib/api/types.ts`** | ✅ **Recommended.** |

The mirror follows **three existing precedents in that very file** — `MEMORY_KINDS` (`:150`), `NODE_KINDS` (`:361`), and especially `REGISTERABLE_SOURCE_KINDS` (`:279-282`), whose doc comment already models the honesty required (naming which values are real and why one is excluded). The new constant carries the same, citing its sources:

```
CONTEXT_FRAGMENT_KINDS = ['code', 'markdown', 'text', 'memory']
// 'binary' is excluded: ingestion-sink.ts:24 never indexes it, so filtering to it always yields zero.
```

**Drift is bounded by design**: the wire stays open (`string[]`), so a drift produces a filter that matches nothing — a UI bug, not a 400 — and the e2e-full compile-with-filter assertion catches the `code` case against a real corpus. Registered as SL-5.

**The form must also not lie about what the filter does** (Finding 7): it filters **after** retrieval, so it narrows a retrieved set rather than fetching more of the chosen kind. Label it accordingly ("Restrict the package to these kinds"), and when it drops everything, D2's guidance names the filter as the cause and offers to clear it. That is the F-061 "counts within these results, never a corpus-wide claim" discipline applied to compile.

**D6 — Clamp disclosure: compare `mutation.variables.budget` to `pkg.budget`. Zero API change.**

Finding 5 establishes `pkg.budget` **is** the effective clamped budget and the client knows what it sent. `useCompile()` is a `useMutation`, so `compile.variables?.budget` gives the requested value with no extra state and no new field:

```
requested = compile.variables?.budget ; effective = compile.data.budget
clamped ⟺ requested !== undefined && effective < requested
```

Copy, scoped to the observed fact per OQ-1: **"Capped to 8,000 tokens — you requested 20,000. Your plan limits a single compile."** It states what happened to *this* compile (provable from the response) and does **not** claim global enforcement (false while MCP bypasses) or name a plan (impossible for a non-admin: `billing/subscription` needs `admin:manage`, `routes/v1/billing.ts:44`).

This is a **notice, not an error** — the compile succeeded and the package is valid. It sits with the package, not in `ErrorState`.

**Rejected: an additive `requestedBudget`/`clamped` response field.** It is unnecessary (the caller already holds both numbers), it costs **E-003 + an SDK regen + envelope-ratio budget** (Finding 8) to tell callers something they can already compute, and NFR-4 says agents must not pay for prose. If a future feature decides agents deserve an *explicit* signal, that belongs with OQ-1's silent-vs-error ADR, where the question actually lives.

**D7 — Presets AUGMENT the budget input; they never replace it.** `tests/e2e-full/tests/human-journey.spec.ts:56` does `page.getByLabel('Token budget').fill('2000')` against a **live deployment**. Replacing the `<Input type="number">` (`inspector-view.tsx:62-77`) with a preset-only control breaks the full-stack gate and is golden rule 6. Presets are buttons/segments that **set** the same controlled state; the labelled numeric input stays fillable. Preset values are grounded in real caps (`billing/domain.ts:38,45,53` — free 8000 / pro 32000 / enterprise 128000) and in `DEFAULT_BUDGET = 2000` (`inspector-view.tsx:19`, also MCP's `DEFAULT_EXPLAIN_BUDGET`, `server.ts:121`): **2k / 8k / 32k**, with anything above the plan clamped and *said so* (D6) rather than hidden or disabled.

**D8 — Recent compiles: a session Zustand store mirroring `notifications.ts` — AND wire `clear()` on sign-out for both.**

The acceptance says session-local; **confirmed as the right call**, and `lib/store/notifications.ts` is the template down to its ethics: a pure exported reducer for offline unit tests, a `LIMIT` cap, and a doc comment forbidding the UI from implying history it lacks. The store holds `{task, budget, filters, at}` and re-running is "prefill the form + submit" — **never auto-compile on mount** (F-061's D12/SL-8, pinned by `inspector-view.test.tsx:67-77`; a compile spends budget and is entitlement-clamped).

**The addition (Finding 10):** `notifications.ts:34-35` documents a sign-out `clear()` that `use-session.tsx:96-99` never calls. A recent-compiles list holds **user-authored task text** — plausibly "audit the auth bypass in payments". Shipping a *second* unclearing session store, right after reading the documented intent that it should clear, is knowingly doubling a gap (golden rule 9). **Wire `clear()` for both stores into `signOut`** — ~3 lines, additive, no behavior change for anyone who doesn't sign out, and it makes an existing doc comment true. Guarded by a test asserting sign-out empties both.

*If the operator considers touching `notifications` creep:* clear only the new store, and the F-060 gap stays registered — but the cost of doing both is 1 line and it closes a real (if modest) same-machine bleed.

**D9 — What F-065-style persistence would need, for the record.** A persisted recent/history surface needs: server-side storage keyed by `{tenantId, principalId}`, a `POST/GET /v1/compiles` (E-003 + SDK + an MCP tool for parity), retention (FR-15's erasure applies — task text is user content, so DSR export/erasure per F-047), and audit. That is a feature, not a `persist()` middleware call: **`localStorage` would be the wrong answer** — it survives sign-out on a shared machine, exactly the bleed D8 closes. Do not reach for it here.

**D10 — Split `inspector-view.tsx` by concern; keep `PackageView`'s contract.** The file is a 266-line component holding form + scores + sections + trace + skeleton. F-062 adds guidance, export, filters, presets, a clamp notice and a recent list. Extract: `compile-form.tsx`, `package-guidance.tsx`, `package-view.tsx`, `package-export.tsx`, `fragment-card.tsx`, `recent-compiles.tsx`. **Not a rewrite for taste** — six new behaviors in one file is untestable in RTL, and the pure logic (`diagnose`, `export`) must live outside components to test without a render. The trace panel (`:211-244`) moves **unchanged** — it is already right, and e2e-full asserts on it.

---

## Approach — verifiable increments

Each increment ends green on `pnpm -w typecheck && pnpm -w lint && pnpm -w test`.

**0. OQ-1 → operator.** Register-vs-fold the MCP clamp bypass. **Does not block increments 1-6** — it only decides whether F-062's clamp copy stays scoped to the observed compile (recommended and safe either way). Register the finding regardless.

**1. Pure logic first — no components.**
`apps/web/lib/export/context-package.ts` (`toMarkdown`, `toJson`, `citationOf`, `fragmentToMarkdown`); `apps/web/lib/inspector/diagnose.ts` (`diagnoseEmptyPackage`); `apps/web/lib/store/recent-compiles.ts`; `apps/web/lib/clipboard.ts`; `apps/web/lib/api/types.ts` (+`CONTEXT_FRAGMENT_KINDS`).
✅ Verify: `pnpm -w test` — the full diagnosis matrix, the **fence-injection** case, path-vs-hash citations, the unrecognised-trace fallback. No DOM needed.

**2. Honest empty guidance** (acceptance 1). `package-guidance.tsx`; gate scores on `fragmentCount > 0` in `package-view.tsx`; wire `useStats()` as a progressive enhancement.
✅ Verify: RTL — an empty package renders **no `progressbar` role at all** and no "100%"; a populated one renders all three; each diagnosis branch; a `useStats` **error** still yields honest trace-only guidance.

**3. Agent-ready export** (acceptance 2). `package-export.tsx` + per-fragment copy in `fragment-card.tsx`.
✅ Verify: RTL — copy writes Markdown to a stubbed clipboard; **a clipboard rejection surfaces `toast.error`, never an unhandled rejection**; download builds a JSON blob (stub `URL.createObjectURL`, assert **`revokeObjectURL`**); per-fragment copy includes the citation.

**4. Compile controls** (acceptance 3). `compile-form.tsx` — kind filters, presets, clamp notice; `recent-compiles.tsx`; `use-session.tsx` sign-out clear.
✅ Verify: RTL — **`getByLabel('Token budget')` still fills** (the e2e-full contract); a preset sets it; `filters.kinds` reach `api.compile`; the clamp notice appears **only** when `data.budget < variables.budget`; a recent entry re-runs on click and **never auto-compiles**; sign-out empties both stores.

**5. Citations become paths** (D4, inside acceptance 2). `fragment-card.tsx` uses the same `citationOf` helper the export uses.
✅ Verify: RTL — a fragment with `provenance.source.path` shows the path; one without falls back to `ref`.

**6. e2e + screenshots + record.** `apps/web/tests/e2e/inspector.spec.ts` (guidance, export, filters, presets, clamp, recents, **axe AA on the guidance state** — F-061's empty-state axe lesson); `tests/e2e-full/tests/human-journey.spec.ts` (+ a path-citation assertion); screenshots 4 themes × 2 modes; effects.json, progress.md, feature_list.json.

## Files to touch

**Web — pure logic (new)**
- `apps/web/lib/export/context-package.ts` (+ `.test.ts`) — Markdown/JSON serialization, fence-safe.
- `apps/web/lib/inspector/diagnose.ts` (+ `.test.ts`) — the empty-package verdict.
- `apps/web/lib/store/recent-compiles.ts` (+ `.test.ts`) — mirrors `lib/store/notifications.ts`.
- `apps/web/lib/clipboard.ts` (+ `.test.ts`) — guarded `writeText` + toast (the pattern of `tokens-panel.tsx:225-230`, minus its unguarded rejection).

**Web — components**
- `apps/web/components/inspector/inspector-view.tsx` — orchestration; **keeps** `?task=` seeding (`:23-27`).
- `apps/web/components/inspector/{compile-form,package-guidance,package-view,package-export,fragment-card,recent-compiles}.tsx` (+ tests) — **new** (D10).
- `apps/web/lib/api/types.ts` — `CONTEXT_FRAGMENT_KINDS` (D5), beside `REGISTERABLE_SOURCE_KINDS` (`:279`).
- `apps/web/lib/auth/use-session.tsx:96-99` — clear session stores on sign-out (D8).
- `apps/web/components/inspector/inspector-view.test.tsx` — extend; the F-061 seed tests (`:67-82`) stay **unmodified**.
- `apps/web/tests/e2e/inspector.spec.ts` — extend.
- `apps/web/tests/contrast.test.ts` — **only if** a new token pair is used as text; prefer existing tokens.
- **NOT** `apps/web/tests/e2e/support/fixtures.ts` — verified: `compile:read` + `stats:read` already present.
- **NOT** `apps/web/app/inspector/page.tsx` — the F-061 `<Suspense>` stays exactly as-is.

**e2e-full / state**
- `tests/e2e-full/tests/human-journey.spec.ts:53-61` — assert a **real path citation** (the only place with a real corpus).
- `.harness/state/{effects.json,progress.md,feature_list.json}`.

**Explicitly NOT touched** (and this is the headline): `packages/context-compiler`, `apps/api`, `apps/mcp`, `packages/sdk`, `packages/billing`, `packages/config`, `packages/retrieval`, `tests/bench/*`.

## Anticipated effects

- **E-004** (design tokens / web) — **the only effect actually extended.** New surfaces (guidance, export actions, presets, clamp notice, recent list) are tokens-only across 4 themes × 2 modes; any new text token pair must be **registered** in `apps/web/tests/contrast.test.ts` in the same change.
- **E-003** (REST `/v1` + MCP contracts) — **declared on the feature, but NOT extended by this design.** Verified: the clamp is derivable from `pkg.budget` + `mutation.variables` (Finding 5); filters already exist (Finding 7); export is client-side (D3). ⇒ **no schema change, no OpenAPI change, no SDK regen, no MCP tool** ⇒ `apps/mcp/src/gateway.test.ts:34-49` (14 tools) and the mcp e2e are untouched. *Record this at close-out — the feature list's declared effects were a reasonable prior, and the tree disproved it.*
- **E-013** (`@tessera/context-compiler` contract) — **declared, NOT extended.** D1 keeps the honesty fix in the UI; `scores.ts`/`assemble.ts`/`quality.ts` are unchanged.
- **E-015** (`instrumentServices`) — **N/A.** No `ApiServices` member; no server code at all.
- **E-018** (auth/RBAC) — **untouched.** No new permission; `compile:read` + `stats:read` already exist and are already in the e2e fixtures.
- **E-005** (gates) — no gate config changes; **no expected movement in `perf`** (Finding 8). If a number moves, something was added that this plan says not to add.

## Test plan

- **Unit (pure, no DOM):**
  - `toMarkdown` — sections from `section.title`; heading is the **path** when `provenance.source.path` exists, `ref` otherwise; `whyIncluded` verbatim incl. the compression note; **fence injection**: a fragment containing ``` and ```` is fenced with a longer run and the output re-parses as one code block; empty package; unicode; a fragment with no `provenance.source`.
  - `diagnoseEmptyPackage` — every branch: retrieve-zero × (`sources:0` / `documents:0` / `documents>0`) × (`stats` present / errored); resolve-zero with `filtersApplied` true/false; compress-zero; **an unrecognised trace degrades to the generic message** (D2's soft-contract guard); a non-empty package returns "no diagnosis".
  - `recent-compiles` reducer — append, cap, de-dupe, `clear`.
  - `clipboard` — resolves; **rejects → `toast.error`, no unhandled rejection**.
- **RTL:**
  - **The regression that defines the feature:** an empty package renders **zero `role="progressbar"` nodes** and no `100%` text; a populated one renders three. (Assert on the *role*, not the string — `aria-valuenow={100}` was half the lie.)
  - Guidance copy per branch; the Sources link; "clear filters" appears only when filters were sent.
  - Export: copy → clipboard content is Markdown with a citation; download → blob + **`revokeObjectURL`**; per-fragment copy carries the citation.
  - Controls: `getByLabel('Token budget')` still fillable (the e2e-full contract); presets set it; filters reach `api.compile`; clamp notice **only** when `data.budget < variables.budget`, and **absent** when equal; recents re-run without auto-compiling.
  - Sign-out empties both session stores.
- **E2E (web, axe):** `/inspector` — stub `**/v1/compile` at the network boundary (ADR-0022, `inspector.spec.ts:38-42`) with **an empty package** and with a populated one; assert guidance vs. scores; export; presets; clamp; **axe WCAG A/AA on the guidance state specifically** — F-061 shipped a *critical* axe violation that only the empty state could reveal, and this feature's whole subject is an empty state.
- **E2E-full:** `human-journey.spec.ts:53-61` keeps `getByLabel('Token budget').fill('2000')` and gains an assertion that the Inspector cites a **readable path** against the real scanned fixture. This is the only place the D4 citation claim can actually be proven.
- **Screenshots:** `/inspector` idle, guidance, and populated (with the clamp notice), 4 themes × light/dark, incl. reduced motion. F-061's `dark:ring-0`-beats-`ring-2` defect was invisible to every test and visible only in a screenshot.

## Verification

Run in gate order ([`../verification/gates.json`](../verification/gates.json)); stop at first failure. Feature-declared: `typecheck`, `lint`, `test`, `e2e`.

| Gate | Command | Evidence |
|---|---|---|
| state | `node scripts/verify-state.mjs` | this plan exists (`verify-state.mjs:245-250`); effects/schema sync |
| typecheck | `pnpm -w typecheck` | clean |
| lint | `pnpm -w lint` | clean (incl. package-boundary: web must not import `@tessera/ingestion`/`@tessera/context-compiler`) |
| format | `pnpm -w format:check` | clean |
| test | `pnpm -w test` | unit + RTL + **contrast** |
| build | `pnpm -w build` | clean — the F-061 `<Suspense>` must still hold |
| e2e | `pnpm -w test:e2e` | api + mcp (**unchanged**) + web (axe AA **on the guidance state**) |
| web-perf | `pnpm -w test:perf` | first-load JS budget — six new components, **no new dependency** |
| e2e-full | `pnpm -w test:e2e:full` | **required** — the Inspector is step 4 of the human journey |
| perf | `pnpm -w bench` | **expect NO movement** — `compileEnvelopeRatio` 1.61/1.63 vs 1.9. A change here means the design was violated. |

Also: `pnpm --filter @tessera/sdk generate` must produce **no diff** — here as a *guard* proving no wire change crept in, not as a step.

## Scope limits & deferrals (stated, not hidden — the F-049/F-060/F-061 precedent)

1. **SL-1 — The corpus-emptiness diagnosis is precise in single-tenant Local; approximate in multi-tenant.** `stats.documents` counts documents indexed for the tenant's *registered sources*, and until **F-071** ingestion writes to `DEFAULT_TENANT_ID` (F-060's SL-6). Copy says "indexed for your sources" (what the number means), never "your corpus contains". Correct in the zero-auth default; over-stateable in a non-default tenant until F-071.
2. **SL-2 — Scores are SUPPRESSED, not corrected.** `computePackageScores` still returns `budgetAdherence: 1 / provenanceCoverage: 1` for an empty package (`scores.ts:17-19`), and `quality.ts:45-52` will still compute a flattering CQS for one. Agents see those numbers **next to `fragmentCount: 0`**, so they are not misled the way the bars misled a human. Fixing the wire is an E-013+E-003 change rippling into quality/explain/SDK/bench for zero user gain (D1) — and the acceptance is explicitly a render rule.
3. **SL-3 — MCP `compile_context`/`explain` bypass the entitlement clamp** (OQ-1, `server.ts:206,357`). F-062 therefore scopes its clamp copy to **this compile** rather than claiming plan enforcement. **Register as a feature.**
4. **SL-4 — Kind filters are applied AFTER retrieval** (`resolve.ts:35`): they narrow a retrieved set, they do not fetch more of the chosen kind. Filtering to `memory` can honestly yield zero. Labelled as "restrict", and the guidance names the filter when it is the cause.
5. **SL-5 — `CONTEXT_FRAGMENT_KINDS` is a documented mirror; no runtime source of truth exists** (Finding 7). Tightening the wire to an enum is **breaking** (NFR-11) and needs an ADR + its own feature. Drift degrades to a filter that matches nothing (never a 400) and is caught by the e2e-full filter assertion.
6. **SL-6 — The clamp notice cannot name your plan.** `GET /v1/billing/subscription` requires `admin:manage` (`routes/v1/billing.ts:44`), so a viewer/member cannot learn their plan. The notice states the observed cap and the requested budget — both provable from the response.
7. **SL-7 — Recent compiles are session-local** (per the acceptance); a reload clears them. D9 records what persistence would really need. `localStorage` is explicitly rejected — it survives sign-out on a shared machine.
8. **SL-8 — Export is client-side; there is no server export endpoint and no MCP export tool** (D3). Agents already receive the structured package; Markdown would be a lossier, dearer encoding of what they have.
9. **SL-9 — The Markdown omits the trace** (JSON carries it). Markdown is for pasting; JSON is the record.

## Risks / open questions

- **OQ-1 (OPERATOR DECISION — does not block coding): the MCP clamp bypass.** See the dedicated section. **Recommendation: register, don't fold** — different service, changes verified agent behavior, and it hides an ADR-grade question (clamp silently like REST, or error?). F-062's copy is honest either way.
- **RISK-1 (highest) — `getByLabel('Token budget')` is a live full-stack contract.** `human-journey.spec.ts:56` fills it against a real deployment. Presets that replace the input break `e2e-full`, which runs **last**. D7 is not a style preference; verify it in increment 4, not at the gate.
- **RISK-2 — the diagnosis over-claiming.** The trace proves *where* the funnel collapsed; only stats hint at *why*, and stats are themselves qualified by F-071 (SL-1). The verdict function must return "I don't know, here is the trace" rather than guess. Pinned by the unrecognised-trace test.
- **RISK-3 — fence injection in the Markdown export.** Fragment text is ingested repo content and `markdown` is a real `DocumentKind`; a naive fence produces broken output on the first `.md` fragment. Structural fix + explicit test (D4). This is the export's analogue of F-061's offsets-not-HTML.
- **RISK-4 — axe on the guidance state.** F-061 shipped a *critical* violation that only its **empty** page could reveal, caught by an unrelated spec. This feature's subject **is** an empty state; run axe on it explicitly.
- **RISK-5 — jsdom lacks `URL.createObjectURL` and a real clipboard.** RTL must stub both (`userEvent.setup()` provides a clipboard). In Playwright, prefer asserting the **toast** over reading the OS clipboard (Chromium needs `clipboard-read` permission and it is flaky) — a weaker assertion honestly chosen over a flaky one.
- **RISK-6 — the `types.ts` mirror** (`apps/web/lib/api/types.ts`, ADR-0022 residual). `CONTEXT_FRAGMENT_KINDS` has no compile-time link to `DocumentKind`. Bounded by the open wire + the e2e-full assertion (SL-5), but it is debt; say so.
- **RISK-7 — golden rule 6 on a flagship surface.** `inspector-view.tsx` is on the human journey and carries F-061's seed contract. Mitigation: the F-061 seed tests (`inspector-view.test.tsx:67-82`) and the trace panel (`inspector-view.tsx:211-244`) must stay green **unmodified** — they are the regression guard.

---
