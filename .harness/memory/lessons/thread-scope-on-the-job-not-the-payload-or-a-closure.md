---
id: thread-scope-on-the-job-not-the-payload-or-a-closure
kind: lesson
title: Thread isolation scope on the QUEUE JOB (required field) + scoped-view ports — not on the content payload, not in a per-runtime closure
links:
  - packages/ingestion/src/domain.ts
  - packages/ingestion/src/ports/sink.ts
  - packages/ingestion/src/pipeline/worker.ts
  - docs/adr/0057-ingestion-scope-on-the-queue-job.md
confidence: 0.9
created: 2026-07-22
---

**Context (F-071):** ingestion indexed every scan into `DEFAULT_TENANT_ID` because the worker — built
once per runtime, not per tenant — had no way to learn which `(tenant, project)` a job belonged to.
The scope had to travel from the source registration to the sink across an async queue boundary.

**The design that held up, and why the alternatives lose:**

- **Scope rides the JOB envelope (`ChangeEvent`), as a REQUIRED field.** The queue job is the one
  thing that crosses from the tenant-aware caller to the tenant-blind worker. Two strings survive
  serialization (BullMQ later) trivially. **Required, not optional** — an optional scope with a
  `?? DEFAULT` fallback keeps the exact silent-default failure you are removing; required makes the
  compiler enumerate every producer once.
- **NOT on the content payload.** The processed document flows through third-party processor stages
  that *return a new document* — so scope there is (a) a deployment concern leaking into a plugin
  contract, and (b) **forgeable by a plugin**. Isolation must not launder through untrusted code.
- **NOT resolved at the worker from a registry lookup or a process map.** A scoped registry would
  need an unscoped `getAny` hole; a `Map<id, scope>` evaporates the moment the worker is a separate
  process — at which point the job arrives scopeless and falls back to the default, silently
  reintroducing the bug under the documented future deployment. A fix that dies under the next
  deployment shape is not a fix.

**Ports carry scope as VIEWS (`forTenant`/`forProject`), not a parameter.** A required scoped-view
member forces every sink implementer to answer "what does scope mean for me?", and a tee that forgot
to re-scope a member would not type-check. A `write(doc, scope)` parameter is silently droppable —
and the whole bug was a silently dropped scope. Match the codebase's universal idiom
(`MemoryStore`/`GraphStore`/`SourceRegistry` all do this) rather than inventing a second one. Base
view = `(default, default)` so every pre-scope caller and test is byte-for-byte unchanged.

**The worker validates the boundary.** A job with a missing/blank scope throws, never defaults —
that is the permanent anti-regression device, not a nicety.

**Corollaries worth their own line:**

- **A leak can hide one layer past the fix.** Landing the write-scope change while the SSE bridge
  still hardcoded the tenant would have leaked one tenant's file paths onto another's event stream
  while the right tenant's feed stayed empty. When you change *where* something is attributed, audit
  every *reader* of that attribution in the same change.
- **"Reported success" and "did work" are different facts** when the transport swallows failures.
  The in-process queue drops job errors after retries by design, so a scan whose every job threw
  still returned `added: 3`. An honest `indexed` count (paths that actually reached the sink) is what
  makes the contradiction visible. Gate a derived count on *being able to derive it* — here
  `awaited-the-drain AND an event-bus-was-wired`, not drain alone; a harness without the bus reported
  a wrong `0` until that was fixed. An absent field beats a wrong one.
- **Assert isolation on a signal with a floor.** Fake embeddings return *something* for any query, so
  "wrong scope → empty results" never holds; the `keyword` signal (a literal term match) is the
  honest proof. (The [[slice-tests-agree-with-each-other-not-reality]] lesson, applied.)
- **When you rewrite a test double for a widened port, assert on OUTCOMES, not on a spy of the base
  object's method** — the worker now calls the scoped *view*, so a `spyOn(sink, 'upsert')` counts
  zero. Assert emitted events + stored contents instead; it is more faithful anyway.
