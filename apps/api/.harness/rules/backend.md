# Rule: Backend service (apps/api)

Service-specific additions to the global [`api`](../../../../.harness/rules/api/api.md) and
[`security`](../../../../.harness/rules/security/security.md) rules. Read those first.

## Composition
- The app is **composition only**: wire ports → adapters via the deployment profile, mount
  Fastify plugins, register routes. Domain logic lives in `@tessera/*` packages, not here.
- One Fastify plugin per concern (auth, rate-limit, CORS, helmet, tracing, OpenAPI); apply
  uniformly via encapsulation, never per-route copy-paste.

## Endpoints & contracts
- All HTTP under `/v1`; schema-first (Zod at boundary → JSON Schema → generated OpenAPI).
- Changing a route or MCP tool contract triggers
  [effect E-003](../../../../.harness/state/effects.json): regenerate OpenAPI + the TS SDK +
  update the dashboard.
- Consistent typed error envelope; never leak internals/stack traces.

## Jobs & realtime
- Background work goes through the **Queue port** (in-proc local → BullMQ cloud); handlers
  are **idempotent and retryable**.
- SSE/WebSocket handlers are backpressure-aware.

## Operational (required for "done")
- `/health` (liveness) + `/ready` (dependencies wired).
- OpenTelemetry spans (request → service → compiler stage → adapter) + structured Pino logs
  with correlation ids; **never log secrets or raw ingested content**.
- Rate limits + request-size limits; auth applied per deployment profile.
