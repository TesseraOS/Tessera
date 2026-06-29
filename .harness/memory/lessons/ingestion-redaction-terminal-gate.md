---
id: ingestion-redaction-terminal-gate
kind: lesson
title: Make security invariants structural (enforced pipeline stage), not advisory
links:
  - packages/ingestion/src/pipeline/worker.ts
  - packages/ingestion/src/redaction/redact.ts
  - docs/adr/0015-ingestion-connector-contracts-and-git-cli.md
confidence: 0.9
created: 2026-06-29
---

**What happened:** F-006 ingestion has to "scrub secrets before persist" (FR-9) while also making
processors **plugins**. If redaction is merely "one processor you should include," a misordered or
omitted pipeline silently leaks a secret to the sink. Instead, the worker composes the pipeline as
`normalize → …user stages… → redact`, **always appending redaction as a terminal, non-bypassable
stage**. The security property holds regardless of how callers configure the pipeline.

A second, smaller gotcha: a stray **NUL byte** got written into a generated source file (it showed
as a normal space in the editor/Read but made Grep flag the file as binary and broke exact-string
Edits). Rewriting the file cleanly fixed it.

**Why:** "production-grade, secure by default" means an invariant a future plugin author can't
accidentally turn off. Defense in depth beats documentation. Also: a test should assert the *actual*
detector attribution — the bare-key detector (`aws-access-key-id`) fires before the
`credential-assignment` rule on `key = "AKIA…"`, so the finding is attributed to the former (the
secret is still removed — that's the property that matters).

**How to apply:** when a feature mixes "extensible/pluggable" with "must always happen" (redaction,
authz checks, validation), enforce the must-happen part in the orchestrator as a fixed stage, not as
optional config. Keep emitted source ASCII-clean; if Grep reports a hand-written file as "binary,"
suspect an injected control char and rewrite it. See [[engineering-standards]] and the security rule.
