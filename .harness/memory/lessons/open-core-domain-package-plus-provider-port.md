---
id: open-core-domain-package-plus-provider-port
kind: lesson
title: Model a paid capability as a domain package + provider port with a local/free adapter as the OSS default
links:
  - packages/billing/src/ports.ts
  - packages/billing/src/adapters/local.ts
  - packages/billing/src/adapters/dodo.ts
  - apps/api/src/routes/v1/billing.ts
  - docs/adr/0031-billing-port-and-open-core.md
confidence: 0.9
created: 2026-07-03
---

**What happened:** F-030 added billing under an **open-core** model (OQ4). The paid capability (Dodo
Payments) is modeled as a `BillingProvider` **port** in a dedicated `@tessera/billing` package whose
**default adapter is local/free** (every tenant on the free plan, no external service). The OSS build has
zero payment dependencies; the cloud tier opts into the Dodo adapter behind the same port. No Dodo
account was available, yet the feature is fully verified offline.

**How to apply:**

- **OSS default = a working free adapter, not a stub.** For an open-core capability, the local adapter
  must be a real, useful implementation (free plan, sensible entitlements) so the OSS product works with
  no external service. The paid adapter is swapped in by config for the cloud profile.
- **Keep the domain in its own package.** A `@tessera/billing`-style package (deps: core only, no web
  framework) holds the model + ports + adapters; the REST surface wraps it. This keeps it reusable and
  keeps heavy runtimes out of consumers (config/MCP).
- **Verify a provider you can't call live.** Unit-test the parts that don't need the network: the webhook
  **signature verification** (constant-time HMAC over the *raw* body) and the **payload → domain mapping**;
  inject a fake `fetch` for the checkout call. Then drive a **signed webhook through the real HTTP route**
  end-to-end (a store update proves the whole path). Note explicitly where the real provider's format
  (e.g. Standard Webhooks) must be reconciled at go-live.
- **Webhooks need the raw body.** Signatures are computed over exact bytes, so re-serializing the parsed
  JSON breaks them. Read the raw body via an **encapsulated** content-type parser scoped to the webhook
  route (so other routes keep normal JSON parsing).
- **Reuse an existing permission before minting one.** Guard billing management with `admin:manage`
  rather than expanding the RBAC catalog — fewer moving parts, no cross-consumer ripple.
- **Name the seams honestly.** Live provider calls, a persistent subscription store, and *entitlement
  enforcement* (wiring plan limits into budgets/quotas) are follow-ups — ship the port + surface, don't
  claim metered enforcement you haven't built.

Pairs with [[verify-cloud-adapter-env-guarded-against-a-container]] (verify cloud adapters offline/guarded)
and [[auth-control-plane-default-none-additive]] (default-off, additive capability). See [[harness-model]].
