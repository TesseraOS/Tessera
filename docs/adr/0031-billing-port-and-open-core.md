# ADR-0031: Billing port + adapters (open-core) — `@tessera/billing`, local/free + Dodo

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** billing, cloud, commercial, open-core, ports, packaging

## Context

OQ4 (license / business model) resolved **2026-07-03 to open-core**: a permissive-OSS core plus a paid
Managed Cloud / enterprise tier. That commits [ADR-0011](0011-billing-dodo-payments.md) (Dodo Payments,
behind a `Billing` port, cloud-only) and unblocks **F-030**. This ADR records the **concrete** design:
where billing lives, the port + adapters, how the webhook is verified, and what is deferred (no Dodo
account/keys are available here to verify live calls).

## Decision

**A new `@tessera/billing` package holds the billing domain + a `BillingProvider` port with a local/free
adapter (OSS) and a Dodo adapter (paid cloud). The REST surface lives in `@tessera/api`; wiring is
`@tessera/config`. Default is local/free, so nothing existing is affected.**

- **`@tessera/billing`** (depends only on `@tessera/core` — no Fastify, so config/MCP stay clean):
  - **Domain:** `PlanId` (`free`/`pro`/`enterprise`) + a `PLANS` catalog carrying `Entitlements`;
    `Subscription` + `SubscriptionStatus`; `effectiveEntitlements` falls back to free for un-entitled
    statuses (canceled/past-due).
  - **Ports:** `BillingProvider` (listPlans/getSubscription/createCheckout/handleWebhook) +
    `SubscriptionStore` — swappable per ADR-0003.
  - **`createLocalBilling`** — the OSS default: every tenant is active on free; checkout + webhooks are
    rejected; **zero external services**.
  - **`createDodoBilling`** — Dodo via native `fetch` (no SDK, per ADR-0024). `verifyDodoSignature` is a
    constant-time HMAC-SHA256 over the **raw body**; `parseDodoEvent` maps a Dodo webhook to a
    `BillingEvent`. **Env-guarded**; live API calls are a documented seam.
- **REST (`@tessera/api`):** `GET /v1/billing/plans` (public), `GET /v1/billing/subscription` +
  `POST /v1/billing/checkout` (`admin:manage`, tenant from the `AuthContext`), `POST /v1/billing/webhook`
  (public, signature-verified). The webhook reads the **raw body** via an **encapsulated** string
  content-type parser, so other routes keep normal JSON parsing. Reuses the existing `admin:manage`
  permission (no RBAC-catalog change). Falls back to `createLocalBilling` when no provider is wired.
- **Config (`@tessera/config`):** a `billing` section (`provider none|dodo`, `dodoBaseUrl`); Dodo secrets
  come via the `SecretsProvider`; `Runtime.billing` + `ApiServices.billing` are selected by config.

## Consequences

### Positive
- Billing is real and testable offline: the domain, local adapter, HMAC webhook verification, and payload
  mapping are unit-tested; a **signed webhook updates a subscription over HTTP** in an e2e.
- **Open-core honored:** the OSS build has no payments dependency; Dodo is opt-in for the cloud tier.
- Back-compatible: default local/free, existing surfaces untouched; the `Billing` port keeps Stripe (or
  another provider) a drop-in.

### Negative / Costs
- The Dodo adapter is **not** live-verified (no account/keys). Its signature scheme is a plain
  HMAC-SHA256(hex); Dodo production uses the Standard Webhooks format — reconcile `verifyDodoSignature`
  when wiring the live account.
- `@tessera/api` + `@tessera/config` gain a `@tessera/billing` dependency (light; core-only).
- Subscriptions persist **in memory** only; a durable store is a seam.

### Neutral / Follow-ups
- Documented seams: live Dodo verification; a persistent `SubscriptionStore`; **entitlement enforcement**
  (wiring `PLANS` limits into the compiler budget + MCP quotas, NFR-12 metering); and the **dashboard**
  billing UI. Usage-based metering hooks build on the entitlements model.

## Alternatives considered

- **Billing inside `@tessera/api`.** Rejected: billing is a distinct domain; a package keeps it reusable
  and out of the HTTP app (matches memory/graph/retrieval).
- **A payments SDK (dodopayments/stripe node).** Rejected for now: `fetch` keeps the dependency surface
  minimal (ADR-0024) and the port isolates the provider.
- **Add billing-specific permissions.** Rejected: `admin:manage` already models "tenant administration";
  avoiding new permissions keeps the RBAC catalog (E-018) stable.

## References

- FR-61, NFR-12, OQ4 (resolved); [ADR-0011](0011-billing-dodo-payments.md) (Dodo direction),
  [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters),
  [ADR-0024](0024-github-connector-and-auto-memory-extraction.md) (`fetch` over SDKs),
  [ADR-0028](0028-api-auth-tenancy-rbac.md) (`admin:manage`). Effects `E-019` (billing) + `E-003` (routes)
  + `E-014` (config wiring).
