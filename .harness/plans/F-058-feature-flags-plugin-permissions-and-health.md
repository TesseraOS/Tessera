# Plan: F-058 Feature flags + plugin permissions & health (FR-57/59/60 completion)

- **Feature:** F-058 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-57 (feature flags), FR-59 (plugin lifecycle: health), FR-60 (plugin
  capability + permission declarations — least privilege)
- **Service / package:** `@tessera/core`, `@tessera/plugin-host`, `@tessera/config`,
  `apps/api`, `packages/sdk`, `apps/web`
- **Author:** Claude (lead, inline — the planner subagent was cut off by a session limit) ·
  **Date:** 2026-07-27

## Intent

Close the three requirements that R4 still carries as declared-but-unbuilt: a **per-tenant
feature-flag** evaluation path from config to the API boundary to the dashboard; **plugin
health** in the lifecycle with an aggregation the operator can see; and **plugin
permissions** declared in the manifest, validated at load, and **denied by default** beyond
what was declared. "Done" for a user: an operator can turn a flag on for one tenant in
config and see it in Settings; a plugin that asks for a capability it never declared is
refused rather than trusted.

## The honest starting position (verified, not assumed)

- **`@tessera/plugin-host` has zero consumers outside its own package.** `grep -rn
  "createPluginHost\|plugin-host" packages apps --exclude-dir=dist`, excluding the package
  itself, returns nothing. No composition root constructs a host. The SDK from F-013 is a
  well-tested library that nothing in the running system holds.
- `PluginInstance` ([`domain.ts:47`](../../packages/plugin-host/src/domain.ts)) has
  `start`/`stop`/`dispose` and **no `health()`**. `PluginManifest` (`domain.ts:33`) has
  **no permission declarations**. The host (`host.ts`) isolates failures but has **no
  restart or backoff**.
- `/ready` is served from `services.readiness`
  ([`health.ts:46`](../../apps/api/src/routes/health.ts)), composed at
  [`assemble.ts:361`](../../packages/config/src/profiles/assemble.ts) where it checks
  exactly one thing — `relational.healthcheck()`.
- There is no `flags` section in `configSchema`
  ([`schema.ts:279`](../../packages/config/src/schema.ts)) and no flag port anywhere.

### Acceptance clause 2 is not fully satisfiable as written — decision required

Clause 2 asks for "host aggregation exposed on `/ready` details". A health aggregation is
only meaningful if the host **holds plugins in the running process**, and today it holds
nothing anywhere. The two candidate ways to give it something load-bearing were both
checked and both rejected:

1. **Route embeddings through the host.** `transformersEmbeddingsPlugin`
   ([`plugins/embeddings.ts:42`](../../packages/plugin-host/src/plugins/embeddings.ts))
   calls `createTransformersEmbeddings` directly — it has no worker-pool branch. The
   composition root's `createEmbeddings` does (F-085, `embeddings.workers`, default 1).
   Sourcing embeddings from the plugin would **silently regress F-085**, putting ONNX back
   on the main thread. Rejected under golden rule 6.
2. **Route connectors through the host.** `connectorForRecord`
   ([`profiles/connectors.ts:18`](../../packages/config/src/profiles/connectors.ts)) is a
   hardcoded `switch` — exactly what a plugin host should replace, and the best home for
   real per-connector permissions. But connectors are constructed **per source record**,
   while the host keys **one instance per plugin id** (`host.ts:66`). Two filesystem
   sources with different roots collide. Making the host multi-instance is a change to the
   ADR-0020 contract and its whole test suite — **scope creep; flagged, not planned in.**

**Decision taken (to be recorded in the ADR):** the host is wired into the runtime as
`Runtime.plugins` and `/ready` gains a `plugins` check that reports the real aggregate of
whatever is registered. In the shipped profiles that is **zero plugins**, and the check
reports exactly that (`ok: true`, `detail: "0 plugins registered"`) — which is a true
statement about the deployment, not a green light invented for an empty set. The
aggregation is proven against a **populated** host in tests. The multi-instance connector
refactor that would make first-party plugins load-bearing is filed as a new backlog
feature; it is the thing that turns this seam into a load path, and it is not this feature.

## Approach

Reuse first: the `Plugin`/`PluginHost` envelope (ADR-0020) is extended, never re-defined;
flags reuse the existing per-request tenant resolution (`request.authContext?.tenantId ??
DEFAULT_TENANT_ID`, the billing-route pattern at
[`billing.ts:49`](../../apps/api/src/routes/v1/billing.ts)); the flags panel reuses the
existing read-only Settings card pattern
([`settings-view.tsx`](../../apps/web/components/settings/settings-view.tsx), ADR-0022 — never
render a fake control).

New contracts:

- **`FlagProvider`** (in `@tessera/core` — dependency-free, already imported by everyone,
  so the API can hold it without a new edge): `evaluate(key, ctx): boolean`,
  `evaluateAll(ctx): Record<string, boolean>`, `list(): readonly FlagDefinition[]`, where
  `FlagEvaluationContext` carries `{ tenantId }`. A **static** adapter
  (`createStaticFlagProvider`) resolves from a config-shaped record with a default plus
  per-tenant overrides. A remote provider is a documented seam behind the same port.
- **`PluginPermission`** — a closed vocabulary (`network`, `filesystem:read`,
  `filesystem:write`, `process:spawn`, `secrets:read`) declared on the manifest, validated
  at load, and handed to `setup` as a **grant object** that answers only for what was
  declared. Anything else throws → the host's existing isolation marks the plugin `failed`.
- **`PluginHealth`** — optional `health()` on `PluginInstance`; `host.health()` aggregates
  per-plugin reports and never throws.
- **Restart/backoff** — a per-plugin restart policy (`maxRestarts`, `initialDelayMs`,
  `factor`) applied when a *started* plugin's health fails or `start` throws; exhausted
  budget leaves the plugin `failed` with the reason. Deterministic in tests via an injected
  clock/sleep.

## Increments (each individually verifiable and committable)

| # | Increment | Proof |
|---|-----------|-------|
| 0 | Plan + **ADR-0061** + claim `in_progress` | `node scripts/verify-state.mjs` |
| 1 | `PluginPermission` vocabulary + `permissions` on the manifest + validated at load + surfaced in `PluginInfo`/`list` | unit tests + mutation check |
| 2 | Denied-by-default enforcement: `PluginContext.permissions` grant; undeclared request throws → isolated `failed` | unit tests incl. the isolation invariant |
| 3 | `health()` in `PluginInstance` + `host.health()` aggregation (never throws; failed plugins report) | unit tests |
| 4 | Restart/backoff policy on failure isolation, deterministic clock | unit tests |
| 5 | `FlagProvider` port + `createStaticFlagProvider` in `@tessera/core` (+ per-tenant override resolution) | unit tests + mutation check |
| 6 | `config.flags` section + `TESSERA_FLAGS_*` env + `.env.example` + `Runtime.flags` wiring in `assemble.ts` | `schema.test.ts`, config integration, `verify-state` env-docs |
| 7 | `GET /v1/flags` evaluated for the calling tenant + SDK method + generated reference | api e2e + docs drift gate |
| 8 | Settings: read-only flags card | web unit + a11y |
| 9 | `/ready` gains the `plugins` check (the decision above); host wired as `Runtime.plugins` | api e2e + config integration |
| 10 | Effect-trace (E-016, E-014, +API/web ids), progress, memory, backlog entry for the multi-instance host, status → `done` | full gates |

## Files to touch

- `packages/core/src/flags.ts` (new) + `index.ts` — the `FlagProvider` port + static adapter.
- `packages/plugin-host/src/domain.ts` — `PluginPermission`, manifest `permissions`,
  `PluginInstance.health()`, `PluginHealthReport`, restart policy types.
- `packages/plugin-host/src/host.ts` — permission validation + grant, health aggregation,
  restart/backoff.
- `packages/plugin-host/src/plugins/*.ts` — first-party plugins declare their permissions
  (`filesystem:read` for the connector; none for fake embeddings).
- `packages/config/src/schema.ts` — `flags` section; `load.ts` — `TESSERA_FLAGS_*`.
- `packages/config/src/runtime.ts` + `profiles/assemble.ts` — `Runtime.flags`,
  `Runtime.plugins`, `/ready` plugin check.
- `apps/api/src/services.ts` (or `BuildServerOptions` — see risk below), `routes/v1/flags.ts`
  (new), `schemas/flags.ts` (new), `routes/v1/index.ts`.
- `packages/sdk/*` + `apps/docs/generated/*` — SDK method + regenerated reference.
- `apps/web/components/settings/flags-card.tsx` (new) + `settings-view.tsx` + `lib/api/*`.
- `.env.example`, `docs/adr/0061-*.md`, `.harness/state/*`, `.harness/memory/*`.

## Anticipated effects

- **E-016** (Plugin SDK/host contract) — the manifest gains required-at-load permission
  declarations and the instance gains `health()`; both first-party plugins and every
  third-party plugin are affected. Restart/backoff changes observable lifecycle semantics.
- **E-014** (`@tessera/config` composition root) — new `config.flags` section, new
  `TESSERA_FLAGS_*` env vars (⇒ `.env.example` ⇒ env-docs gate ⇒
  `apps/docs/generated/env-reference.json`), `Runtime.flags` + `Runtime.plugins`, and a
  second `/ready` check.
- **E-003 / E-015** (`ApiServices` shape) — see the risk below; the F-057 precedent is that
  runtime-only members belong on `BuildServerOptions`, not `ApiServices`, because
  `instrumentServices` rebuilds `ApiServices` member-by-member and a dropped member 500s its
  routes in production (recorded as having happened twice).
- Dashboard/SDK effects for the new endpoint (ids confirmed during the effect-trace step).

## Test plan

- **Unit:** permission vocabulary + validation + denial; health aggregation with a mix of
  healthy/failed/unimplemented plugins; restart/backoff sequencing on an injected clock;
  static flag resolution (default, per-tenant override, unknown key).
- **Integration:** `first-party-plugins.test.ts` extended for declared permissions; config
  integration for `flags` + `Runtime.flags`/`Runtime.plugins`; `/ready` reports the plugin
  check.
- **E2E:** `apps/api` — `GET /v1/flags` returns the calling tenant's evaluation and honours
  a per-tenant override; `apps/web` — the Settings flags card renders from the API and
  passes axe.
- **Mutation spot-checks** on the new predicate-heavy code (permission denial, flag
  override resolution), per the cadence the last features used.

## Verification

Gates in order from [`../verification/gates.json`](../verification/gates.json):

```
node scripts/verify-state.mjs
pnpm -w typecheck
pnpm -w lint
pnpm -w format:check
pnpm -w test
pnpm -w build
pnpm -w test:e2e
```

`web-perf` / `e2e-full` / `perf` are release gates; run `pnpm -w test:e2e:full` at the
closing increment since `/ready` and the composition root are touched. Evidence (counts
before/after, mutation results) captured per increment in `progress.md`.

## Risks / open questions

1. **`ApiServices` vs `BuildServerOptions` for the flag provider.** E-015 records two
   production incidents from adding members to `ApiServices`. Default: put the provider on
   `BuildServerOptions` like F-057 put `usage`. Confirm against `instrumentServices` before
   increment 7.
2. **Clause 2's honesty** — decided above; the ADR must state it plainly rather than let a
   `plugins: ok` line imply a capability the deployment does not exercise.
3. **Permission vocabulary is advisory, not sandboxed.** ADR-0020 already says isolation is
   *error* isolation, not process isolation. A declared-permission model in-process is a
   **declaration + gate at the host boundary**, not containment; the ADR must not overclaim.
   This is the honest FR-60 reading ("declarations … validated at load, denied-by-default
   beyond declarations"), and the plan does not pretend otherwise.
4. **Scope creep flagged, not planned:** multi-instance plugin host (would make
   `connectorForRecord` go through the host); remote flag provider implementation; flag
   *write* surface in the dashboard (ADR-0022 forbids a fake control, and no write API is in
   the acceptance).
