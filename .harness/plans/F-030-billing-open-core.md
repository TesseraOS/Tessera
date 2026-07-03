# Plan: F-030 — Billing & subscriptions behind a Billing port (open-core)

- **Feature:** F-030 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-61, NFR-12
- **ADRs:** **0031 (new — Billing port + adapters, open-core)**; confirms **0011** (Dodo, direction); relates to 0003 (ports), 0024 (fetch over SDKs), 0028 (admin:manage)
- **Package:** `@tessera/billing` (new) + `@tessera/api` (surface) + `@tessera/config` (wiring) · **Author:** Claude · **Date:** 2026-07-03
- **Verification:** typecheck · lint · test · e2e (keep format + build green)
- **Gate resolved:** OQ4 → **open-core** (2026-07-03).

## Intent
Ship billing & subscriptions behind a swappable `BillingProvider` port under an **open-core** model: the
domain + a **local/free** adapter are OSS (zero external deps); **Dodo Payments** serves the paid Managed
Cloud tier behind the same port (ADR-0011). Default local/free, so nothing existing is affected.

## Scope (acceptance is the contract — nothing more)
- **In:** a `@tessera/billing` package (domain: `PLANS` catalog + `Entitlements` + `Subscription`; ports:
  `BillingProvider` + `SubscriptionStore`; adapters: `createLocalBilling` (free) + `createDodoBilling`
  (fetch, env-guarded, HMAC webhook verify + payload mapping) + in-memory subscription store); config
  `billing` section + `Runtime.billing`/`ApiServices.billing`; a REST `/v1/billing/*` surface; ADR-0031.
- **Deliberately out (documented seams):** live Dodo API verification (no account/keys — reconcile the
  signature scheme with Dodo's Standard Webhooks at go-live); a persistent `SubscriptionStore`;
  **entitlement enforcement** (wiring `PLANS` limits into the compiler budget + MCP quotas, NFR-12
  metering); the dashboard billing UI.

## Approach
Mirror the repo's ports + adapters + local-first + env-guarded-cloud pattern (F-023/F-025). Billing is a
distinct domain → its own package (deps: `@tessera/core` only — no Fastify, so config/MCP stay clean). The
REST surface wraps the port; the webhook reads the **raw body** via an **encapsulated** string content-type
parser (signatures are over exact bytes). Reuse the existing `admin:manage` permission (no RBAC-catalog
ripple). Wiring is config-driven (`provider none|dodo`), Dodo secrets via the `SecretsProvider`.

### Increments
1. `@tessera/billing`: domain + ports + local/dodo adapters + subscription store + unit tests.
2. Config `billing` section + `Runtime.billing`/`ApiServices.billing` wiring.
3. `@tessera/api` `/v1/billing` routes + schemas; regenerate the SDK; e2e (incl. a signed webhook).
4. ADR-0031 + OQ4 record (PRD/ADR-0011) + effects + records.

## Anticipated effects
- **E-019 (new)** — the billing contract (ports + PLANS + adapters).
- **E-003** — new `/v1/billing/*` routes + schemas → OpenAPI + generated SDK regenerated.
- **E-014** — config `billing` wiring (`Runtime.billing` / `ApiServices.billing`).

## Test plan
- **Unit (billing):** plan catalog + entitlements (canceled → free); local adapter (free, checkout/webhook
  rejected); Dodo signature (valid/invalid/missing), `parseDodoEvent` (map + errors), `handleWebhook`
  (signed → store upsert; bad → 401), checkout via injected fetch.
- **E2E (api):** plans public; subscription (admin via local none); checkout rejected locally; a **signed
  Dodo webhook over HTTP** updates the subscription; bad signature → 401.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` ·
`pnpm test:e2e` · `pnpm build`. Regenerate `@tessera/sdk` (billing changes the OpenAPI) and commit it.

## Risks / open questions
- **No live Dodo** → verify offline (signature + mapping + a signed webhook through the real route); the
  Standard-Webhooks reconciliation is a labelled seam.
- **Raw webhook body** in Fastify → an encapsulated string parser scoped to the webhook route.
- **Entitlement enforcement** intentionally deferred — the model exists; wiring limits into budgets/quotas
  is a follow-up (don't claim metering not yet built).
