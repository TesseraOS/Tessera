# Plan: F-021 — Realtime updates (SSE)

- **Feature:** F-021 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-38
- **ADRs:** none new (extends ADR-0016 REST surface; SSE over HTTP)
- **Package:** `@tessera/api` (extend) · **Author:** Claude · **Date:** 2026-07-02
- **Verification:** typecheck · lint · test · **e2e** (keep format + build green)

## Intent
Push **live updates** to clients (FR-38): a **Server-Sent Events** endpoint `GET /v1/events` streams
domain events — **ingest progress** and **new memories** — over one long-lived HTTP connection, so the
dashboard reflects change without polling. "Done" = a connected client receives events (a captured memory,
an ingestion update) in real time, with heartbeats and clean teardown.

## Scope (acceptance is the contract — nothing more)
- **In:** an `ApiEventBus` (typed, in-process, over the core `EventBus`) injected into `buildServer`;
  `GET /v1/events` SSE route (`text/event-stream`, reconnect hint, heartbeat, disconnect cleanup); the
  memory-capture route as a **real producer** (`memory.captured`); OpenAPI lists the endpoint; unit +
  e2e tests.
- **Deliberately out (noted honestly):** **WebSocket** (SSE covers server→client push for FR-38; WS is a
  later option if bidirectional is needed); wiring the **ingestion** producer into a running runtime (the
  ingestion worker already emits `IngestionEvents`, but it isn't wired into the API runtime yet — that's
  the same downstream corpus/runtime seam; the `document.ingested/removed` event types + transport are
  provided and testable by emitting on the bus); auth/last-event-id resume/backpressure (per-profile,
  later).

## Approach — additive to the REST surface
SSE is HTTP-native and testable. The route `reply.hijack()`s and owns `reply.raw`, writing framed events;
it **subscribes before** the opening comment (no lost event between connect and subscribe), heartbeats on
an `unref`'d timer, and tears down subscriptions + timer on `request.raw` `close`. The event source is an
injected `ApiEventBus` (default created inside `buildServer`), so producers (the memory route now; the
ingestion worker later, via the composition root) emit onto the same bus.

## Files to touch
- `apps/api/src/events.ts` — **new**: `ApiEventMap` (`document.ingested` / `document.removed` /
  `memory.captured`) + `API_EVENT_TYPES` + `ApiEventBus` + `createApiEventBus()` + `sseFrame`/`sseComment`.
- `apps/api/src/routes/v1/events.ts` — **new**: `registerEventsRoutes(app, events)` — the SSE handler.
- `apps/api/src/routes/v1/memory.ts` — the capture route emits `memory.captured` on the bus (real producer).
- `apps/api/src/routes/v1/index.ts` — pass the bus to the memory + events route registrars.
- `apps/api/src/server.ts` — `BuildServerOptions.events?: ApiEventBus` (default `createApiEventBus()`);
  thread it into `registerV1Routes`.
- `apps/api/src/index.ts` — export the events module (so the composition root can create/wire the bus).
- `apps/api/src/events.test.ts` — unit: `sseFrame`/`sseComment` framing; bus emit/receive.
- `apps/api/tests/e2e/sse.e2e.test.ts` — e2e: start a **real** server (`listen` port 0), open the SSE
  stream via `fetch`, and assert it delivers (a) an event emitted on the injected bus and (b) a
  `memory.captured` from a real `POST /v1/memory`; then abort + close cleanly.

## Anticipated effects
- **E-003** (REST/MCP surface contracts): **additive** — a new `GET /v1/events` route on the REST surface
  (versioned, NFR-11). No change to existing routes/schemas; MCP is unaffected (SSE is a REST-only
  transport). OpenAPI regenerates to include it.

## Test plan
- **Unit:** `sseFrame(type, data)` → `event: <type>\ndata: <json>\n\n`; `sseComment` → `: <text>\n\n`;
  `createApiEventBus()` delivers an emitted payload to a subscriber.
- **E2E (real socket):** connect to `/v1/events`; after the `: connected` frame, emit on the injected bus
  → the client reads the framed event; separately `POST /v1/memory` → the client reads `memory.captured`
  with the lineage/kind/title; aborting the request triggers server-side cleanup (no hang). Existing inject
  e2e stays green; OpenAPI doc includes `/v1/events`.

## Verification
Workspace-wide: `node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` ·
`pnpm test` · `pnpm test:e2e` (api e2e incl. the new SSE test) · `pnpm build`.

## Risks / open questions
- **Testing a long-lived stream** → use a real `listen` + `fetch` reader with an `AbortController`, not
  `app.inject` (which waits for a response to end); subscribe before the opening comment to avoid a race.
- **Leaks / hanging tests** → tear down on `request.raw` `close`; `unref` the heartbeat; the test aborts and
  `app.close()`s.
- **Proxy buffering** → set `x-accel-buffering: no` + `cache-control: no-transform` so intermediaries don't
  buffer the stream.
