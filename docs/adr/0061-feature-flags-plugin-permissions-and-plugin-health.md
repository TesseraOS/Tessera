# ADR-0061: Feature flags as a port with a static adapter; plugin permissions as declared-and-gated (not sandboxed); plugin health aggregated over a host the runtime actually holds

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Project lead, Claude
- **Tags:** plugins, config, extensibility, operations, feature-flags

## Context

F-058 closes three requirements R4 still carried as declared-but-unbuilt: **FR-57** (feature
flags for progressive rollout), **FR-59**'s remaining clause (plugin *health* in the
lifecycle), and **FR-60** (plugin capability/permission declarations, least privilege).

Three facts about the starting position, verified rather than assumed:

1. **`@tessera/plugin-host` has no consumers.** Excluding the package itself, nothing under
   `packages/` or `apps/` imports it — no composition root constructs a `PluginHost`. F-013
   shipped a well-tested library that the running system does not hold.
2. `PluginInstance` has `start`/`stop`/`dispose` and **no `health()`**; `PluginManifest` has
   **no permission declarations**; the host isolates failures but never retries.
3. There is no flag port anywhere and no `flags` section in `configSchema`.

ADR-0020 already fixed the shape of the plugin envelope (wrap the existing ports; isolate
failures; first-party plugins use the same contract). This ADR extends that envelope and
decides how far the new guarantees actually reach.

## Decision

### 1. `FlagProvider` is a port in `@tessera/core`, with a static config-backed adapter

`evaluate(key, ctx)` / `evaluateAll(ctx)` / `list()`, where the context carries the
`tenantId`. The shipped adapter (`createStaticFlagProvider`) resolves a flag from its
default plus per-tenant overrides; a remote provider (LaunchDarkly, Unleash, an internal
service) is a **seam behind the same port**, not a stub pretending to be one.

It lives in `@tessera/core` because core is dependency-free and already imported
everywhere — so `@tessera/api` can evaluate a flag without a new workspace edge, and the
composition root can hand one over without dragging anything in. Flags are a product
primitive, not a deployment adapter; putting the port anywhere else would have made the
API depend on a package it has no other reason to know.

Evaluation happens **at the API boundary, per tenant**, reusing the tenant the request
already resolved (`request.authContext?.tenantId ?? DEFAULT_TENANT_ID`) — the same
expression the billing routes use. No new tenancy mechanism.

The dashboard surface is **read-only**. There is no flag-write API in scope, and ADR-0022
forbids rendering a control that does nothing.

### 2. Plugin permissions are **declared and gated at the host boundary — not sandboxed**

A manifest declares from a closed vocabulary (`network`, `filesystem:read`,
`filesystem:write`, `process:spawn`, `secrets:read`). The host validates the declaration at
load, hands `setup` a **grant object that answers only for what was declared**, and refuses
anything beyond it — denied by default. A refusal throws, which the existing isolation
converts into `failed` rather than a crash (the FR-58 invariant is preserved, not bypassed).

**This ADR does not claim containment.** ADR-0020 §Consequences already recorded that
isolation is *error* isolation and a plugin still runs in-process; a plugin that ignores
the grant object and calls `fs` directly is not stopped by anything here. What the model
buys is a **declared, inspectable, enforced-at-the-seam capability surface**: an operator
can see what a plugin claims to need before loading it, and a plugin that reaches through
the host for something it never declared is refused. Overstating this as a sandbox would be
the more damaging error, so it is stated plainly instead.

### 3. Plugin health aggregates over a host the runtime holds — and reports the empty set honestly

`PluginInstance` gains an optional `health()`; `host.health()` aggregates per-plugin reports
and never throws. Failure isolation is extended with a **restart/backoff policy**
(`maxRestarts`, `initialDelayMs`, `factor`) driven by an injectable clock so the sequencing
is deterministic in tests; an exhausted budget leaves the plugin `failed` with the reason.

The host is wired into the composition root as `Runtime.plugins`, and `/ready` gains a
`plugins` check reporting the real aggregate of whatever is registered.

**In every profile Tessera ships today, that set is empty, and the check says so** —
`ok: true`, `detail: "0 plugins registered"`. That is a true statement about the deployment
("this process loads no plugins"), not a green light manufactured for an empty collection,
and the aggregation is proven against a **populated** host in tests rather than by the
always-empty production path.

The two ways to make first-party plugins load-bearing were evaluated and **both rejected**:

- **Embeddings through the host** would regress F-085. `transformersEmbeddingsPlugin` calls
  `createTransformersEmbeddings` directly and has no worker-pool branch, while the
  composition root's `createEmbeddings` does. Sourcing embeddings from the plugin puts ONNX
  back on the main thread, where a scan stalls every concurrent request — the measured
  problem F-085 exists to fix.
- **Connectors through the host** is the *right* eventual answer — `connectorForRecord` is a
  hardcoded `switch`, exactly what a plugin host should replace, and the natural home for a
  real `filesystem:read` declaration. But connectors are constructed **per source record**
  while the host keys **one instance per plugin id**, so two filesystem sources with
  different roots collide. Making the host multi-instance rewrites the ADR-0020 contract and
  its suite. It is filed as its own backlog feature.

## Consequences

### Positive

- FR-57 is a real path end to end: config → per-tenant evaluation at the API boundary →
  visible in Settings, with a remote provider swappable behind the port.
- A plugin's capability needs are declared, validated before it runs, and refused beyond the
  declaration; the operator can inspect them through the host API.
- A plugin that goes unhealthy is retried with backoff instead of staying dead until
  restart, and the aggregate is reachable from `/ready`.
- `Runtime.plugins` gives the host a documented home in the process, so registering a plugin
  no longer requires rebuilding the composition root.

### Negative / Costs

- The `plugins` readiness check is **inert in shipped profiles** until something registers a
  plugin. It is honest, but it is not yet load-bearing, and this ADR is the record of that.
- The permission model is advisory against a hostile plugin (§2). Real containment needs
  process/worker isolation — still the ADR-0020 follow-up it always was.
- A new config section means new `TESSERA_FLAGS_*` env vars, `.env.example` upkeep, and a
  regenerated env reference.

### Neutral / Follow-ups

- Multi-instance plugin host (per `(pluginId, instanceId)`) so `connectorForRecord` can go
  through it — the change that turns §3's seam into a load path.
- A remote `FlagProvider` adapter; flag *writes* (needs an API, an audit action, and RBAC —
  none in F-058's acceptance).
- Process/worker sandboxing to upgrade §2 from declaration to containment.

## Alternatives considered

- **Flags in `@tessera/config` rather than `@tessera/core`.** The provider would then be a
  deployment adapter and `@tessera/api` could not hold the port without a new edge. Rejected
  — a flag is a product primitive.
- **Evaluate flags in the composition root and pass booleans.** Cheaper, but flags become
  process-lifetime constants and per-tenant rollout — the entire point of FR-57 — is
  impossible. Rejected.
- **An open-ended permission string.** Maximum flexibility, zero enforceability: nothing can
  validate a free-form claim at load. Rejected for a closed vocabulary.
- **Report `/ready` plugin health only when plugins exist (omit the check otherwise).** A
  disappearing check is harder to operate against than a check that states the empty set.
  Rejected.
- **Skip the `/ready` wiring entirely until a plugin is load-bearing.** Considered and put to
  the lead explicitly; the wiring was chosen so the extension point is reachable, with the
  emptiness recorded here rather than glossed.

## References

- Implements F-058. Extends effects **E-016** (Plugin SDK/host) and **E-014**
  (`@tessera/config` composition root).
- Related: [ADR-0020](0020-plugin-sdk-and-host.md) (the envelope this extends, and the
  in-process isolation limit it already recorded),
  [ADR-0018](0018-config-loader-and-local-profile.md),
  [ADR-0059](0059-self-hosted-profile-and-deployment-artifacts.md) (ProfileAdapters),
  [ADR-0022](0022-interim-dashboard-data-client.md) (never render a fake control),
  [ADR-0028](0028-api-auth-tenancy-rbac.md) (the tenant the evaluation reuses).
  `docs/PRD.md` FR-57/FR-59/FR-60; `docs/architecture/ARCHITECTURE.md` §12.
