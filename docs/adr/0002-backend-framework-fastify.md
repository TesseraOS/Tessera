# ADR-0002: Backend framework — Fastify on Node.js LTS + TypeScript

- **Status:** Accepted
- **Date:** 2026-06-27 (ratified; originally agreed 2026-06-25)
- **Deciders:** Project lead, Claude
- **Tags:** backend, framework

## Context

The backend serves a REST/JSON API, an MCP interface, SSE/WebSocket live updates, and
runs ingestion workers. We need: first-class TypeScript, schema-based validation and
serialization, a real plugin/encapsulation model (we are plugin-centric), strong
throughput, and a healthy ecosystem. Node.js LTS is the target runtime for ecosystem
breadth and operator familiarity.

## Decision

We will use **Fastify** (latest stable v5 line) on **Node.js 22 LTS** with
**TypeScript** (strict). Specifically we lean on:

- Fastify's **plugin + encapsulation** model as the substrate for our own plugin
  architecture (connectors, processors, AI/storage providers).
- **JSON Schema** validation/serialization, with **Zod** at trust boundaries and
  schema generation feeding **OpenAPI** contracts.
- `@fastify/*` ecosystem for CORS, helmet, rate-limit, JWT/OIDC, and OpenAPI/Swagger.

## Consequences

### Positive
- High throughput and low overhead; schema-based serialization is fast and safe.
- The encapsulation model maps cleanly onto our plugin SDK and per-request context.
- OpenAPI falls out of the schemas, enabling generated client SDKs.

### Negative / Costs
- Smaller mindshare than Express; some middleware must be adapted or rewritten.
- The plugin lifecycle has a learning curve versus "just add middleware."

### Neutral / Follow-ups
- Standardize on a Zod ⇄ JSON-Schema bridge so one source of truth drives validation,
  serialization, and OpenAPI.

## Alternatives considered

- **Express** — ubiquitous but unopinionated, weaker TS story, no built-in schema
  serialization, plugin model not as strong. Rejected.
- **NestJS** — batteries-included and structured, but heavier abstraction (decorators,
  DI) than we want for a performance-sensitive engine; we prefer composing explicitly.
- **Hono / Elysia** — excellent and edge-friendly, but a smaller enterprise ecosystem
  (auth, OpenAPI, observability) today. Revisit for edge deploys only.
- **Bun runtime** — compelling speed, but we prioritize Node LTS ecosystem maturity and
  operator familiarity for an enterprise target. Not adopted now; not precluded later.

## References

- [ADR-0001](0001-architecture-modular-monolith-in-turborepo.md),
  `docs/architecture/ARCHITECTURE.md`.
