# ADR-0010: CI/CD via GitHub Actions

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Project lead, Claude
- **Tags:** ci, ops, tooling

## Context

The harness defines verification gates ([`.harness/verification/gates.json`](../../.harness/verification/gates.json))
but nothing runs them automatically yet. "Verification is the proof" only holds at scale if
the gates run on **every change**, not just when an agent remembers. The repo currently has
no remote; CI must be ready to activate the moment one exists. This was an uncaptured gap in
the original brief ("CI/CD").

## Decision

Use **GitHub Actions** as the CI/CD provider.

- A `ci` workflow runs the harness gates on push/PR: `verify-state` → `typecheck` → `lint`
  → `format:check` → `test` → `build` → `e2e` (mirroring `gates.json`), on Node 22 with pnpm
  + Turbo remote-cacheable steps.
- Additional checks: dependency audit + secret scanning (NFR-1), and (web) Lighthouse/axe
  budgets.
- **Branch protection** requires green CI before merge once a remote/PR flow exists.
- CD (build/publish/deploy) is added per deployment mode later (self-host image at R1,
  cloud at R2) — this ADR fixes the **provider and the gate-on-every-change principle**, not
  the full deploy pipeline.

## Consequences

### Positive
- Gates run automatically and consistently; humans/agents can't skip them.
- Native to where the code will live; Turbo caching keeps CI fast.

### Negative / Costs
- Vendor coupling to GitHub Actions (acceptable; workflows are portable YAML if needed).
- Some gates (`e2e`, Lighthouse) need CI runners with browsers — slower, run selectively.

### Neutral / Follow-ups
- Tracked as feature **F-029**; activates when a Git remote is added (today there is none).
- Keep workflow steps in lockstep with `gates.json` (an effect-link once both exist).

## Alternatives considered

- **GitLab CI / CircleCI / Jenkins** — fine tools, but more setup/ops for no benefit given
  the likely GitHub home.
- **No CI (rely on local gates)** — rejected; defeats "verification at scale."

## References

- [`.harness/verification/gates.json`](../../.harness/verification/gates.json),
  [`.harness/protocols/verification.md`](../../.harness/protocols/verification.md), `docs/PRD.md` (NFR-15).
