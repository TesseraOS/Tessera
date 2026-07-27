---
id: mutation-checks-audit-the-comment-not-only-the-code
kind: lesson
title: Run the mutation your comment claims — F-057 wrote six "turns this red" claims and four were false
links:
  - packages/billing/tests/conformance/usage-store.conformance.ts
  - packages/billing/src/usage/adapters/aggregate-row.ts
  - apps/api/tests/e2e/usage.e2e.test.ts
confidence: 1
created: 2026-07-27
---

**What happened:** the house standard is that a test comment names the mutation that turns it red.
F-057 wrote those comments as it went, then actually *ran* every one of them. Four were wrong — and
each wrong one was wrong in a way that mattered:

1. **"Only this assertion catches the missing bigint parse."** Mutating `toUsageAggregate` one field
   at a time against real Postgres: `count`/`tokens`/`scoredCount` are `sum()` over an *integer*
   column → bigint → **string** (RED), but the four `double precision` sums already arrive as
   numbers (**GREEN — nothing to catch**). The parse is load-bearing for three of seven fields; on
   the rest it is a deliberate no-op. The comment now says which, and why it stays.
2. **"Dropping the `.catch` breaks failure isolation."** It does not — Fastify's `onResponse` runs
   after the response is sent, so a rejected hook is logged, never surfaced. The isolation comes from
   the framework; the `.catch` only improves the log line. The test pins the *behaviour*, and says so.
3. **"Hard-coding `metered: true` would be caught."** Nothing asserted the **default**, or
   `runtime.metered` at all. Two mutations came back GREEN, and those were the exact defaults whose
   inversion had already shipped a bug (see
   [[a-decision-is-not-implemented-until-the-composition-root-implements-it]]).
4. **"The self-hosted suite covers the migrations."** Deleting `pgSubscriptionMigrations` from
   `ALL_MIGRATIONS` left **all 129 tests passing** — nothing on that path had ever touched the
   `subscriptions` table.

**The rule:** a "mutation check" comment written from intuition is a *hypothesis*. Running it is
cheap (a script that patches, runs the filtered suite, restores) and it audits the **comment** as
much as the code. Two outcomes are both wins: RED confirms the claim, GREEN reveals either a missing
assertion (add it) or an over-claim (correct the comment — never delete the line, since a no-op that
survives a driver change still earns its place).

**Three traps that cost real time while doing it:**

- **`apps/*` consume workspace packages through their `dist`.** A source mutation there is not felt
  until the package is rebuilt — and an unbuilt change does **not** present as a focused failure, it
  presents as *every test in the suite timing out at 10s, including `GET /health`*, because route
  registration throws. Rebuild the changed package before drawing any conclusion.
- **Restore by writing back the captured text, never `git checkout --`.** A `git checkout` on an
  uncommitted file silently reverted a whole increment's work mid-session.
- **A malformed mutation reads exactly like a passing test.** One "GREEN — not caught" turned out to
  be a mutation that never removed the thing it claimed to; the real asymmetry, written properly, was
  RED. If a mutation comes back green, first prove the mutation *did* what you think.
