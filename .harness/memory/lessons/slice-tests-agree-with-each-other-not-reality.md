---
id: slice-tests-agree-with-each-other-not-reality
kind: lesson
title: Sliced tests agree with each other, not with reality — one real deployment found 3 defects in an hour
links:
  - tests/e2e-full/support/full-stack-server.mjs
  - tests/e2e-full/tests/agent-journey.spec.ts
  - tests/e2e-full/tests/human-journey.spec.ts
  - packages/config/src/sources/ingestion-sink.ts
  - .harness/verification/gates.json
confidence: 0.95
created: 2026-07-16
---

**What happened:** F-048 stood up the first suite that runs Tessera as ONE deployment (a real server
over real adapters with a real repo ingested, driven by the real dashboard AND the real `tessera-mcp`
binary). Every other gate was green. The first run found **three real defects** — and disproved two of
my own assumptions about the system.

The defects (F-071/F-072/F-073) share a shape: **each lives in the gap BETWEEN two subsystems that are
each individually well tested.**

- **F-071** — ingestion indexes into `DEFAULT_TENANT_ID` unconditionally, so a multi-tenant scan reports
  `added: 3` while the registering tenant sees nothing. Ingestion tests pass (it indexes!). Auth tests
  pass (tenants isolate!). Nobody tested *ingest **as** a tenant, then read **as** that tenant* — because
  every api/mcp e2e runs in the zero-auth default tenant, where the bug is invisible **by construction**.
- **F-072** — the MCP gateway authenticates fine over HTTP-ish transports; stdio carries no credential.
  Gateway tests inject a `resolveCredential`, so they never ask where a real stdio credential comes from.
- **F-073** — search returns `{ref: <sha256>}` with no label; the dashboard's `label ?? ref` renders a
  64-char hash. The web tests stub the API with fixtures that *have* labels, so the UI looked fine.

**Why:** a stub encodes what you *believe* the other side returns. Two subsystems tested against each
other's stubs will agree with each other forever, including about things that are false. The stub is
the bug's hiding place. **F-073 is the purest case: the fixture had a label, so the UI "worked".**

**How to apply:**
- When a test needs a fixture for a *neighbouring subsystem*, that fixture is an assumption. Write it
  down as an assumption, and make sure ONE test somewhere gets the real value.
- **A "successful" write that the caller cannot read back is not a success.** `added: 3` + an empty
  search is the signature. Assert the round trip (write as X, read as X), not the ack.
- Run the real thing on a REAL config axis, not just the default one. The default (`none`
  auth, default tenant) is exactly where multi-tenancy bugs cannot appear. F-071 needed a non-default
  tenant to become visible at all.
- Budget for it: this gate boots two servers + a browser + an MCP process. `workers: 1`, `retries: 0`
  (a flaky full-stack gate is a lie), `requiredFor: release` — not per-commit.
- **Do not fix the findings inside the test feature.** Register them (F-071/72/73), pin the suite to the
  honest supported shape, and leave a loud comment at the pin explaining *why*, so nobody "fixes" it back
  into a mystery failure. A test feature that quietly patches product code hides the very thing it found.

**Gotchas this cost real time on (all Tessera-specific, all invisible to stubbed suites):**
- **Refs are content hashes, not paths.** `{ref: 'c775e5…'}`. Any assertion matching `ledger.ts`
  against a ref fails. File **graph nodes** are keyed source-relative + extensionless (`src/ledger`, via
  `fileNodeKey`), which is a *different* key space from retrieval refs.
- **A semantic retriever has no relevance floor** — a nonsense query still returns nearest neighbours, so
  "search for garbage → expect empty" never passes. The **keyword/FTS** signal is the load-bearing proof
  a hit is real: an FTS match on a term unique to the fixture can only have come from the fixture.
- **The real Monaco editor must be `focus()`ed and typed into**, never `fill()`ed: it is a
  contenteditable (`role=textbox`), and its `.view-line` overlay intercepts clicks. Unit tests stub
  Monaco, so a full-stack suite is the only place the real editor is exercised.
- **Cross-process SQLite works** — `sqlite-relational` sets `journal_mode = WAL`, so a second process
  (the real `tessera-mcp`) can open the same DB. Serialize the writers anyway.
- **`startApiServer` beats re-wiring `buildServer`** in a harness: it *is* the shipped entry, so the test
  can't drift from production wiring. Likewise, hand off via a **file** rather than grafting an `/e2e/*`
  route onto the real server.
- **verify-state enforces gates.json ↔ CI**: flipping a gate to `active` without adding the CI step fails
  the state gate. That guard works — let it.

See [[erasure-must-de-index-not-just-delete]] (same theme: a second copy of the data nobody tested) and
[[instrument-services-must-forward-every-apiservices-member]] (the other time a real server found what
the green suite missed).
