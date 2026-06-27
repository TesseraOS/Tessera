# Protocol: Observability

**Trigger:** when adding or operating runtime code. Observability belongs **inside** the
harness and the product — you cannot verify or debug what you cannot see (NFR-7).

## What every runtime change must provide
1. **Tracing.** OpenTelemetry spans across API → domain service → compiler stage →
   adapter. Propagate a correlation/trace id end-to-end.
2. **Structured logs.** Pino, JSON, with the correlation id, level, and context. **Never
   log secrets or raw ingested content** ([security rule](../rules/security/security.md)).
3. **Metrics.** Emit the signals that matter: request latency, queue depth, cache hit
   rate, retrieval quality, compile latency per stage, error rates.
4. **Health.** `/health` (liveness) and `/ready` (dependencies wired) endpoints.

## Product-specific: the compilation trace
The Context Compiler must write a **compilation trace** (inputs, candidates, scores, drops
per stage) — a first-class, user-visible artifact powering the dashboard Package Inspector
(FR-44), distinct from infra telemetry. Treat it as a required output of every compile, not
a debug add-on.

## Verification tie-in
A feature touching runtime paths is not [done](definition-of-done.md) unless it is
observable: spans/logs/metrics present, health unaffected, and (for compiler work) the
trace populated.
