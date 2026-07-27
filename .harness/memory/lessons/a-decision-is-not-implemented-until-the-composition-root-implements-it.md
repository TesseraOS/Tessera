---
id: a-decision-is-not-implemented-until-the-composition-root-implements-it
kind: lesson
title: A decision is not implemented until the composition root implements it — ADR-0056 said self-hosted is uncapped, and every self-hosted deployment was capped for two releases
links:
  - docs/adr/0056-entitlement-clamp-silent-and-metered-only.md
  - docs/adr/0060-usage-metering-analytics-and-the-metered-predicate.md
  - packages/billing/src/budget.ts
  - packages/config/src/profiles/assemble.ts
confidence: 1
created: 2026-07-27
---

**What happened:** F-057 needed to enforce `maxMonthlyCompiles`, so it had to answer "who is metered?"
[ADR-0056 §3](../../../docs/adr/0056-entitlement-clamp-silent-and-metered-only.md) had already
answered it — *"a deployment that wired a `BillingProvider` is metered; one that wired none is
self-hosted and is not"* — and listed **"self-hosted users stop being capped at a cloud tier's limit"**
under its *Positive* consequences.

That consequence was never real. Traced end to end:

| step | effect |
|---|---|
| `createRuntimeBilling` returns `createLocalBilling()` for `provider: 'none'` | a provider is **always** wired |
| that adapter resolves every tenant to `freeSubscription` | every tenant looks free |
| the free plan caps `maxTokensPerCompile` at 8000 | … at the cloud free tier |
| `createCompileBudgetClamp` treats any defined provider as metered | so it clamps |

From F-035 until F-057, **every** runtime-composed Local and self-hosted deployment was silently
capped at 8000 tokens per compile — the exact outcome the ADR forbade. The Inspector's own 32000
preset was being quietly reduced. Enforcing the monthly cap under the same predicate would have
hard-blocked those deployments after **200 compiles a month**.

**Why it survived a full feature's review:** the tests asserted the two cases the author was thinking
about — "no provider ⇒ no clamp" and "a provider ⇒ clamp" — and **never the case the composition root
actually produces**: a provider IS wired *and* the deployment is not metered. A predicate with two
inputs needs the case that isolates each; the shipped suite covered one diagonal of the truth table
and read as complete.

**The general shape.** An ADR states an intent. The composition root decides whether that intent is
true at runtime, and it is the only place that can silently disagree. When an ADR's consequence is a
*negative* ("X is NOT capped", "Y does NOT run here", "Z is never sent"), nothing fails when it stops
holding — absence is invisible. So:

1. **Grep the ADR's own claim against the wiring**, not against the module the claim is about. The
   clamp was correct; the caller made its precondition unreachable.
2. **Detect capability explicitly, never structurally.** "Is an object present" is a proxy that a
   fallback quietly invalidates. `metered = config.billing.provider !== 'none'` is a stated fact that a
   default cannot corrupt — and it defaults to the safe answer (unmetered), with a test that the
   default is what it claims (flipping it turned *nothing* red until that test existed).
3. **Test the shape the composition root produces**, not only the shapes the unit accepts.
4. Fix it in **its own commit**, so a behaviour change to long-green code bisects cleanly — and re-run
   the gates that consume the changed value (`e2e-full` and `bench` both compile, so both had to run).

**Cross-check that found it:** the effect-link pass, not a test. Reading ADR-0056 while planning a
feature that would *extend* its rule is what exposed the gap — which is the argument for consulting
the ADR whose decision you are about to build on, rather than the code that implements it.
