---
id: unmetered-is-not-the-free-plan
kind: lesson
title: "`?? createLocalBilling()` conflated *unmetered* with *free-tier* — a fallback that answers a different question than the one being asked"
links:
  - packages/billing/src/budget.ts
  - apps/api/src/routes/v1/compile.ts
  - docs/adr/0056-entitlement-clamp-silent-and-metered-only.md
confidence: 0.9
created: 2026-07-22
---

**What happened (F-077):** the MCP compile tools never applied the plan entitlement clamp that REST
applied, so an agent could request any token budget. The obvious fix was to copy REST's line —
`services.billing ?? createLocalBilling()`, then clamp.

Copying it would have shipped a second bug. `createLocalBilling()` reports a **free** subscription,
so that fallback does not mean *"no billing configured"* — it means *"treat this deployment as a
free-tier customer."* Those are different claims, and the `??` made them look like one. The visible
consequence: every self-hosted deployment was capped at the cloud Free plan's 8000 tokens on REST
already, and the fix would have extended that to agents as a silent overnight regression.

**Why it stayed invisible:** the fallback reads as a null-safety idiom, not as a policy decision.
`x ?? defaultProvider()` looks like plumbing. It was actually answering "what plan is this customer
on?" for someone who is not a customer.

**How to apply:**
- **When a fallback supplies a *policy* object rather than an empty value, name the policy.**
  `?? createLocalBilling()` should have been unmistakably "treat unconfigured deployments as free
  tier" — at which point someone asks whether that is right. Ours became an explicit rule instead:
  *a deployment that wired a provider is metered; one that did not is not.*
- **Check what the requirement actually says before enforcing it.** NFR-12 is *cost control* —
  "Local-default avoids API spend; cloud tracks per-tenant usage/cost." It never asked us to throttle
  someone running their own hardware. The cap was enforcing a *pricing tier* against a person with no
  bill.
- **Escalate product-shaped questions instead of inheriting them from code.** The repo genuinely did
  not settle this: the docs called 8000 a *default*, marketing promised "free forever where your code
  lives", and only the fallback implied a cap. That is a decision for the product owner, not a thing
  to infer from a `??`.
- **When a fix changes behaviour, replace the test that pinned the old behaviour with tests that pin
  the new one — plural.** The api e2e went from one assertion (local clamps to 8000) to two
  (unmetered does not clamp; metered does), so coverage rose rather than fell. Deleting the old
  assertion alone would have looked identical in the diff stat and been much worse.

**And the general one, which is why this is filed separately from the feature:** a defect fix is the
moment you inherit every assumption baked into the code you are copying. Read the line you are about
to duplicate as if it were a proposal, not a precedent. See also
[[replay-the-original-miss-through-any-new-gate]].
