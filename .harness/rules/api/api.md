# Rule: Backend / API

Applies to `apps/api` and server-side packages. Stack: Fastify + TS
([ADR-0002](../../../docs/adr/0002-backend-framework-fastify.md)).

## HTTP & contracts
- All routes under a **version prefix** (`/v1`); changes are **additive**; breaking
  changes require a new version + deprecation window (NFR-11).
- **Schema-first**: every route declares request/response JSON Schema; validation via Zod
  at the boundary, serialization via Fastify's schema. **OpenAPI is generated** from these
  — don't hand-maintain it.
- Consistent error envelope (typed code, message, details); never leak stack traces or
  internals to clients.

## Structure
- Use Fastify **plugins + encapsulation** as the unit of composition; cross-cutting
  concerns (auth, rate-limit, CORS, helmet, tracing) are plugins applied uniformly, not
  per-route copy-paste.
- Routes are thin: validate → call domain service (a package) → map result. **No business
  logic in route handlers.**
- Domain services depend on **ports**, not adapters; wiring happens at app composition.

## Realtime, jobs, MCP
- Long work goes through the **Queue port** (in-proc local → BullMQ cloud); handlers are
  idempotent and retryable.
- SSE/WebSocket for live updates; backpressure-aware.
- MCP tools ([`@tessera/mcp`](../../../docs/architecture/ARCHITECTURE.md)) wrap the same
  domain services the REST API uses — one engine, two surfaces.

## Operational
- Provide `/health` and `/ready`; emit OpenTelemetry spans per request and per compiler
  stage; structured Pino logs with correlation ids (see
  [`../../protocols/observability.md`](../../protocols/observability.md)).
- Enforce rate limits and request size limits; apply auth per deployment profile.
