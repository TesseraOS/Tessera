# AGENTS.md — apps/api (Tessera backend)

> **Scope:** the backend service (`@tessera/api`) and the server-side domain packages it
> composes. **Extends the root harness — read [`../../AGENTS.md`](../../AGENTS.md) first.**
> Everything global (golden rules, the working loop, verification, effect-links,
> clean-state) applies here unchanged. This file only **adds** backend specifics; it never
> relaxes a global rule.

`extends: root`

## What this service is
The deployable Fastify app: HTTP `/v1`, the MCP server, SSE/WebSocket, and the ingestion
workers — composing the domain packages (`@tessera/context-compiler`, `retrieval`,
`knowledge-graph`, `memory`, `storage`, `ai`, …) behind ports & adapters.
See [`../../docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md).

## Service rules (in addition to root)
- Backend rules: [`.harness/rules/backend.md`](.harness/rules/backend.md) and the global
  [`api`](../../.harness/rules/api/api.md) + [`security`](../../.harness/rules/security/security.md)
  rules.
- **Routes stay thin**: validate → call a domain service (a package) → map result. No
  business logic in handlers.
- **Depend on ports, not adapters.** Wiring happens at app composition via the deployment
  profile ([`@tessera/config`](../../docs/architecture/ARCHITECTURE.md)).
- **Every port change runs its conformance suite** before the work is done
  ([effect E-001](../../.harness/state/effects.json)).
- Provide `/health` + `/ready`; emit OTel spans + Pino logs per the
  [observability protocol](../../.harness/protocols/observability.md).

## Relevant features
F-003…F-013, F-015, F-016 (and R1+ backend work) in
[`../../.harness/state/feature_list.json`](../../.harness/state/feature_list.json).

> Stub: the service code arrives in the coding phase (starting at F-001 scaffold). This
> harness is here first so the rules exist before the code does.
