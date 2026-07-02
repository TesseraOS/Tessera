---
id: sse-test-real-socket-and-subscribe-before-handshake
kind: lesson
title: Test SSE over a real socket, and subscribe to the event source before writing the opening frame
links:
  - apps/api/src/routes/v1/events.ts
  - apps/api/tests/e2e/sse.e2e.test.ts
  - apps/api/src/events.ts
confidence: 0.85
created: 2026-07-02
---

**What happened:** F-021 added a Server-Sent Events endpoint (`GET /v1/events`) to the Fastify API. Two
things about long-lived streams don't behave like normal request/response handlers:

1. **`app.inject` can't test it.** `inject` resolves when the response *ends*; an SSE stream never ends,
   so an inject-based test hangs. Drive it over a **real listening socket** instead: `app.listen({ port: 0 })`,
   `fetch(url, { signal })`, read `response.body.getReader()` and accumulate frames until a predicate
   matches, then `AbortController.abort()` and `app.close()`. Track controllers and abort them in
   `afterEach` so a failed assertion can't leave the socket (and the server close) hanging.

2. **Subscribe before the opening frame.** In the handler, register the event-source subscription
   **before** writing the `: connected` handshake. If you write the handshake first and subscribe after,
   an event emitted in that window is lost — and a test that waits for `: connected` before emitting would
   flake. Ordering the subscription first makes "client saw the handshake" a guarantee that the
   subscription is live.

Handler mechanics that matter: `reply.hijack()` to take over `reply.raw` (Fastify won't serialize/send);
`text/event-stream` + `cache-control: no-transform` + `x-accel-buffering: no` so proxies don't buffer;
an `unref`'d heartbeat timer; and teardown (clear timer + unsubscribe) on `request.raw` `'close'`.

**How to apply:**
- For any streaming/long-lived endpoint, write the test against a real socket with a reader + abort, not
  the in-process inject helper; clean up connections in `afterEach` regardless of assertion outcome.
- In a push handler, wire the producer→consumer subscription **before** signalling readiness to the
  client, so nothing emitted during setup is dropped.
- Keep the streamed payloads small, JSON-safe, and non-sensitive (summaries, never raw content) — the same
  redaction discipline as logs.
