# ADR-0011: Billing & subscriptions via Dodo Payments (Managed Cloud, R2)

- **Status:** Accepted (direction) — build deferred to R2
- **Date:** 2026-06-27
- **Deciders:** Project lead, Claude
- **Tags:** billing, cloud, commercial
- **Depends on:** OQ4 (license / business model) in `docs/PRD.md`

## Context

The original brief listed **Dodo Payments** in the frontend stack. Billing is only relevant
to the **Managed Cloud / commercial** deployment (R2+) — Local and Self-Hosted modes have no
billing. Rather than drop the requirement or build it prematurely, we capture the **provider
direction** now so it's traceable, and defer implementation to the cloud milestone.

## Decision

When we build billing (R2), use **Dodo Payments** as the payments provider.

- **Why Dodo:** it acts as a **merchant of record** (handles global sales tax/VAT, fraud,
  compliance) — valuable for a small team selling SaaS internationally without standing up a
  tax/compliance org.
- Billing lives **only** in the cloud deployment profile, behind a `Billing` port (so the
  provider is swappable and Local/Self-Hosted simply have no billing adapter) — consistent
  with ports & adapters ([ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md)).
- Scope when built: plans/subscriptions, usage-based metering hooks (NFR-12), webhooks for
  entitlement changes, and a billing surface in the dashboard.

## Consequences

### Positive
- Requirement preserved and traceable (feature **F-030**) without premature work.
- Merchant-of-record offloads tax/compliance burden.
- Port boundary keeps non-cloud modes billing-free and the provider replaceable.

### Negative / Costs
- Provider lock-in risk → mitigated by the `Billing` port.
- Final commitment depends on the **license/business-model** decision (OQ4); if Tessera is
  not sold as SaaS, this ADR may be superseded.

### Neutral / Follow-ups
- Revisit at R2 with OQ4 resolved; if business model changes, supersede this ADR.
- Alternative provider (Stripe) remains a drop-in via the port if Dodo proves unsuitable.

## Alternatives considered

- **Stripe** — largest ecosystem, but **not** a merchant of record by default (tax/compliance
  on us, or via Stripe Tax add-ons). Kept as the fallback behind the `Billing` port.
- **Defer entirely (no provider chosen)** — rejected; the lead chose to capture Dodo now.
- **Build billing earlier (R0/R1)** — rejected; no billing in Local/Self-Hosted.

## References

- `docs/PRD.md` (FR-61, OQ4, NFR-12), [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md).
