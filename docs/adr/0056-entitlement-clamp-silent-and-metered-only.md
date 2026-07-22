# ADR-0056: The compile entitlement clamp is silent, published, and applies to metered deployments only

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Project lead (explicit, on the self-hosted question) + implementing agent
- **Tags:** billing, mcp, api, entitlements, agent-surface

## Context

`POST /v1/compile` capped the requested token budget to the caller's plan (F-035). The MCP
`compile_context` and `explain` tools did not — `apps/mcp/src/server.ts` had **zero** references to
billing and forwarded `budget` verbatim. NFR-12 was therefore enforced on the surface humans use and
unenforced on the surface **agents** use, which is the population the cap exists to meter (F-077).

Closing it forces two questions the feature's acceptance criteria demand be argued rather than
defaulted:

1. **Silent or explicit?** REST clamps silently today. Does MCP match, or do both surfaces start
   telling the caller their budget was reduced?
2. **Who is metered?** The REST route resolved `services.billing ?? createLocalBilling()`, and the
   local adapter reports a **free** subscription — so a self-hosted deployment that wired no billing
   was capped at the cloud free tier's 8000 tokens. Extending that to MCP would have silently
   dropped every self-hosted agent from "any budget" to 8000.

### One premise, corrected

F-077's note asserted that *"an agent that is quietly downgraded cannot distinguish a clamp from a
thin corpus."* **That is not true, and the decision below depends on it not being true.**
`packages/context-compiler/src/stages/assemble.ts` sets `budget: request.budget`, and the caller
clamps *before* invoking the compiler — so `pkg.budget` **is** the effective budget. A caller holds
what it asked for, therefore `requested > pkg.budget` ⟺ clamped, exactly. A thin corpus returns
`pkg.budget === requested` with few fragments; a clamp returns `pkg.budget < requested`. The two are
distinguishable with no extra field, which is what F-062 found independently when it built the
dashboard's clamp notice.

## Decision

### 1. The clamp is silent on `compile_context`, and published

`compile_context` clamps without adding a field, matching REST. The information is already on the
wire (above), and an additive field would bill every agent on every compile for a fact each caller
can derive from data it already holds — NFR-4 governs the agent surface hardest, and F-062 set the
precedent by refusing an additive field for this exact question and proving the refusal with a
zero-diff SDK regeneration.

Silence is not secrecy: **the rule is published in the tool description**, which `tools/list`
delivers once per session rather than per call. Silent-and-undocumented was the actual defect;
silent-and-published is a contract an agent can read before it is surprised.

### 2. `explain` names the clamp outright

`Explanation` gains an optional `budgetClamp: { requested, effective }`, present **only when a clamp
applied**. `explain` is the deliberately verbose diagnostic path — the tool an agent reaches for when
a package looks wrong — and it already pays for prose. It has no REST twin, so there is no parity to
break. The common case costs nothing because the field is omitted.

### 3. Metered deployments only — self-hosted is not "the free plan"

**A deployment that wired a `BillingProvider` is metered and is clamped; one that wired none is
self-hosted and is not.** `createCompileBudgetClamp(undefined)` returns a pass-through.

- NFR-12 is **cost control** — *"Local-default avoids API spend; cloud tracks per-tenant usage/cost."*
  A self-hosted operator runs their own hardware and spends their own money. There is no cost for us
  to control and no tenant to meter, so a cap protects nobody and merely throttles the open-core
  promise the marketing site makes ("free forever where your code lives").
- **The plan catalog is untouched.** The cloud **Free** plan keeps its 8000-token cap, still renders
  as such on the pricing page, and a metered tenant on `free` clamps exactly as before. The old
  `?? createLocalBilling()` fallback conflated *unmetered* with *free-tier*; those are different
  things and the fallback is what made them look the same.
- Wiring the local adapter **explicitly** still meters you — the unmetered case is the *absence* of a
  provider, not the identity of one. Asserted in `packages/billing/src/budget.test.ts`.

### 4. One implementation, structurally

Both surfaces build their clamp from `createCompileBudgetClamp` in `@tessera/billing` (Fastify-free,
so the MCP runtime may import it without violating F-012). Extending the rule — a per-project cap, a
burst allowance — changes one function and both surfaces move together. Two copies of an entitlement
rule will drift; F-077 exists because one surface had no copy at all.

## Consequences

### Positive
- The bypass is closed: an agent cannot obtain an over-cap package on a metered deployment.
- Self-hosted users stop being capped at a cloud tier's limit — on **both** surfaces, since REST had
  the same conflation.
- The rule has exactly one implementation and a parity e2e that fails if either surface drifts.

### Negative / Costs
- **A behaviour change on REST**, not only MCP: an unmetered deployment that used to cap at 8000 now
  does not. That is the intended correction, and the e2e that pinned the old behaviour was replaced
  by two that pin the new one (unmetered uncapped, metered capped) — coverage increased.
- **A silent clamp still requires the caller to compare** `pkg.budget` against its request to notice.
  Accepted, because the alternative taxes every call forever, and `explain` covers the diagnostic
  case explicitly.
- Cloud tenants on `free` see no change whatsoever.

## Alternatives considered

- **Explicit clamp field on both surfaces.** Rejected: it charges every compile on the token-lean
  surface for a derivable fact, and contradicts F-062's recorded reasoning.
- **Cap self-hosted at the free tier (strict parity with the old REST behaviour).** Rejected by the
  project lead: it enforces a cloud pricing tier against someone incurring no cloud cost, and would
  have landed as a silent regression for existing self-hosted agent users.
- **Cap self-hosted but make it configurable.** Rejected as scope the defect does not need — it adds
  a config surface and a doc to preserve a cap we do not believe in.
- **Reject an over-cap request with an error instead of clamping.** Rejected: it breaks every
  existing caller for a condition the server can satisfy perfectly well by capping, and REST has
  clamped since F-035.

## References

- Realized by **F-077**. Related: [ADR-0036](0036-agent-first-operations.md) (REST/MCP parity),
  [ADR-0011](0011-billing-dodo-payments.md) / [ADR-0031](0031-billing-port-and-open-core.md)
  (plans + provider port), PRD **NFR-12**, **FR-35**.
- Effect-links **E-003** (REST/MCP contract) and **E-013**.
- `packages/billing/src/budget.ts` is the single implementation.
