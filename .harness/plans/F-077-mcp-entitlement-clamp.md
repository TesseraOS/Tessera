# Plan: F-077 — MCP compile bypasses the plan entitlement clamp

- **Feature:** F-077 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-12 (plan entitlement enforcement), FR-35 (MCP surface)
- **Service / package:** `apps/mcp` + `apps/api` + `packages/billing`
- **Author:** implementing agent · **Date:** 2026-07-22
- **Effects declared:** E-003 (REST/MCP contract), E-013

## Intent

`POST /v1/compile` caps the requested token budget to the caller's plan
(`clampBudgetToPlan` over `services.billing ?? createLocalBilling()`, so free-tier limits apply by
default). `apps/mcp/src/server.ts` has **zero** references to billing: `toCompileRequest` forwards
`budget` verbatim into both `compile_context` and `explain`. NFR-12 is therefore enforced on the
surface humans use and unenforced on the surface **agents** use — the population the cap exists to
meter.

Done means: an over-cap budget cannot produce an over-cap package on either surface, both surfaces
clamp through **one** implementation, and the silent-vs-explicit question is decided once, in an ADR,
with the decision applied consistently.

## Verified facts this plan rests on (checked against the tree, not assumed)

1. `apps/api/src/routes/v1/compile.ts:41` clamps; `apps/mcp/src/server.ts` does not. Confirmed.
2. `packages/billing` depends on `@tessera/core` **only** — no Fastify. So `apps/mcp` may import it
   as a value without violating the F-012 invariant (the MCP runtime must never pull Fastify).
3. **There is no REST `/v1/explain`.** `explain` is MCP-only, so it has no twin to keep parity with
   and no OpenAPI/SDK consequence.
4. **The clamp is already derivable from the response.**
   `packages/context-compiler/src/stages/assemble.ts:90` sets `budget: request.budget`, and the
   route clamps *before* calling compile — so `pkg.budget` **is** the effective budget. A caller
   holds what it asked for, therefore `requested > pkg.budget` ⟺ clamped, exactly.
   **This contradicts the feature note's premise** ("an agent quietly downgraded cannot distinguish a
   clamp from a thin corpus"): it can, precisely. A thin corpus returns `pkg.budget === requested`
   with few fragments; a clamp returns `pkg.budget < requested`. The ADR must be argued from the
   corrected fact, and the note's claim corrected rather than inherited.

## The decision (ADR-0056) — silent clamp, discoverable rule, explicit in `explain`

Acceptance clause 2 demands this be argued, not defaulted. Given fact 4:

- **`compile_context` clamps SILENTLY, matching REST.** The information is already on the wire.
  Adding a `budgetClamped`/`requestedBudget` field would bill every agent on every compile for a
  fact each caller can already derive from data it holds — and NFR-4 governs the agent surface
  hardest. This is the F-062 precedent applied unchanged (it refused an additive field for exactly
  this, and proved the refusal with a zero-diff SDK regeneration).
- **The rule becomes DISCOVERABLE rather than merely silent.** The `compile_context` tool
  description states that the budget is capped to the caller's plan. `tools/list` is read once per
  session, not per call, so this costs nothing per compile and means an agent knows the rule exists
  *before* it is surprised by it. Silent-and-undocumented is the actual defect; silent-and-published
  is a contract.
- **`explain` states the clamp explicitly**, because it is the deliberately verbose diagnostic path
  — the tool an agent reaches for when a package looks wrong — and it has no REST twin to diverge
  from. `Explanation` gains an optional `budgetClamp: { requested, effective }`, present **only when
  a clamp actually applied**, so the common case pays nothing.

This satisfies clause 2's first branch (behaviour parity: both surfaces clamp silently) and adds
disclosure exactly where it is free.

## Approach

**One implementation (acceptance clause 3).** Today's clamp is a 3-line composition
(`effectiveEntitlements(await billing.getSubscription(tenantId))` → `clampBudgetToPlan`) plus the
`?? createLocalBilling()` fallback. Copying that into MCP would be two implementations of one rule —
precisely the F-060/F-061 drift the acceptance forbids. So it is extracted into `@tessera/billing`:

```ts
/** Resolve once (incl. the local/free fallback); returns the per-call clamp both surfaces use. */
export function createCompileBudgetClamp(
  billing?: BillingProvider,
): (tenantId: string, requestedBudget: number) => Promise<number>;
```

REST calls it once at route registration, MCP once at `buildMcpServer`. Extending the rule (a
per-project cap, a burst allowance) changes one function and both surfaces move together — the
structural property clause 3 asks for.

### Increments

1. **`packages/billing`** — `createCompileBudgetClamp` + unit tests (free/pro/enterprise, unlimited
   `-1`, the no-provider fallback, never raises a budget).
2. **`apps/api`** — `compile.ts` adopts it (behaviour identical; existing tests must stay green
   untouched, which is the proof it is a refactor).
3. **`apps/mcp`** — `+@tessera/billing` dep; clamp in `compile_context` and `explain`; the
   `explain` clamp disclosure; tool-description wording; unit + e2e.
4. **ADR-0056** + index row; state records.

## Files to touch

- `packages/billing/src/domain.ts` (or a new `budget.ts`) + `src/index.ts` + a test.
- `apps/api/src/routes/v1/compile.ts` — adopt the shared clamp.
- `apps/mcp/src/server.ts` — clamp both tools; `apps/mcp/src/explain.ts` — optional `budgetClamp`;
  `apps/mcp/package.json` — `+@tessera/billing`.
- `apps/mcp/tests/e2e/` — a new entitlement e2e.
- `docs/adr/0056-*.md` + `docs/adr/README.md`.
- `.harness/state/{feature_list,effects,progress}.json|md`.

## Anticipated effects

- **E-003** — MCP tool *behaviour* changes (an over-cap budget is now capped) with **no input/output
  shape change** on `compile_context`; `explain` gains an **optional** field. No REST route change,
  so **no OpenAPI/SDK regeneration** — assert that by regenerating and expecting a zero diff.
- **E-013** — the entitlement rule now has exactly one implementation; both surfaces are dependents.
- **E-026** — `explain`'s schema does not change, but its *description* may; if any tool description
  changes, `apps/docs/generated/mcp-tools.json` must be regenerated in the same increment.
- **F-062's dashboard clamp notice** reads the same derived signal and is unaffected.

## Test plan

- **Unit (billing):** each plan's cap, `-1` unlimited, no-provider fallback → free caps, and that the
  clamp never *raises* a budget.
- **Unit (mcp):** `explain` carries `budgetClamp` only when clamped.
- **E2E (mcp), the acceptance assertion:** with a free-plan tenant, call `compile_context` with a
  budget above the cap and assert `pkg.budget === 8000` (today it returns 20000 — the test must be
  seen to fail against the pre-fix code, or it proves nothing).
- **E2E parity:** the same tenant + budget through REST and MCP returns the same effective budget.
- **Regression:** existing api/mcp suites unchanged and green — the REST refactor must not move.

## Verification

`node scripts/verify-state.mjs`, `pnpm -w typecheck|lint|format:check|test|build`, `pnpm -w test:e2e`,
and **`pnpm -w test:e2e:full`** (acceptance clause 4 names it explicitly). Evidence recorded in
`progress.md`, including the pre-fix failure of the new e2e.

## Risks / open questions

- **The MCP surface has no billing wiring today**, so `services.billing` is `undefined` in every
  current composition root → the local/free adapter applies → **the free cap (8000) becomes the
  effective default for agents**. That is the correct NFR-12 behaviour, but it is a *behaviour
  change for existing local users* who previously got any budget they asked for. Local deployments
  are exactly who `createLocalBilling` is for; if its default is not "free tier" for a self-hosted
  single user, this would wrongly throttle them — **verify what `createLocalBilling` actually
  returns before shipping**, and if it is free-capped, decide deliberately whether Local should be
  unlimited (`-1`) rather than silently capping self-hosted users at 8000.
- Cache interaction: `computeCompilationKey` keys on `request.budget`, which is now the *clamped*
  value — correct (two tenants on different plans must not share a cache entry), but worth asserting.
