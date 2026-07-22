# ADR-0055: Trunk-based development on `main`, with a remote

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Project lead (explicit, this session) + implementing agent
- **Tags:** governance, process, git

## Context

[`commit-policy.md`](../../.harness/governance/commit-policy.md) carried two claims that
have drifted apart from the repository:

1. *"This repo currently has **no remote**; the genesis/initial commit on `main` is fine.
   Re-evaluate when a remote is added (an ADR if the model changes)."*
2. *"Established repo with a remote: **branch per feature** (`feat/F-00x-slug`), open a PR;
   don't push feature work straight to the default branch."*

A remote **does** exist — `origin` → `github.com/TesseraOS/Tessera.git`, with `origin/main`
tracked. So the factual premise of (1) is stale, and by (2) every feature since the remote
appeared should have been branched. None were: F-054's eight commits, and the features before
it, all landed directly on `main`. The stale sentence was the one being read, and the
re-evaluation it explicitly scheduled never happened.

This surfaced while selecting work after F-054. Left alone, the policy document would keep
contradicting both reality and its own rule, which is corrosive in a repository whose first
golden rule is *"the repository is the system of record."*

## Decision

**Trunk-based development on `main` is the deliberate model for this repository**, remote or
no remote. The branch-per-feature + PR rule in `commit-policy.md` is retired; the surrounding
guardrails are not.

What stays exactly as it was:

- **Only green states are committed** — gates run, evidence recorded, never a red build and
  never a half-applied multi-file edit.
- **Review the staged diff** before every commit; no blind `git add -A`.
- **One logical change per commit**, with the build green at each one.
- **Pushing, force-pushing, and anything touching a remote still require an explicit user
  request, every time.** The remote's existence does not weaken this — if anything it makes
  it load-bearing, because `origin` is a public GitHub repository.

## Rationale

- **It matches months of authorized practice.** The same reasoning the standing commit cadence
  used in 2026-07-04: the written policy is being corrected to match reality, not the other
  way round.
- **The single-operator case does not benefit from PRs.** Branch-per-feature earns its cost
  through review by *someone else*. Here the author and the merger are the same party, so a
  PR adds ceremony and a merge commit without adding a reader. The independent check that
  actually catches things in this repository is the **evaluator pass** (planner / generator /
  evaluator separation), which is orthogonal to branching — F-054's evaluator failed the first
  submission on a real user-visible defect, on `main`, with no PR involved.
- **The verification gates are the safety net, not the branch.** Nothing merges without
  `verify-state`, typecheck, lint, format, test, build, e2e and the perf gates passing; a
  branch would not add a check that the gates do not already run.
- **Honest history over tidy history.** Forward-fixing on `main` (as F-054's review findings
  were) leaves the correction and its reasoning in the log, where a squashed PR would hide it.

## Consequences

### Positive
- The policy document stops contradicting the repository, and its stale "no remote" premise is
  gone.
- No ceremony tax per feature; the commit cadence and the gates carry the quality bar.

### Negative / Costs
- **No pre-merge CI signal.** With no PR, CI runs after the fact. Mitigated by the standing
  rule that gates run locally *before* each commit, with evidence recorded in
  [`progress.md`](../../.harness/state/progress.md) — but a CI-only failure (a platform
  difference, a missing secret) lands on `main` rather than on a branch. This is the real cost
  and it is accepted knowingly.
- **`main` can hold a defect between discovery and forward-fix**, as F-054 briefly did. The
  mitigation is the same one that caught it: an evaluator pass before a feature is called done.
- If a second contributor joins, this decision should be revisited immediately — the rationale
  above is explicitly a single-operator argument, and it does not survive a second author.

## Alternatives considered

- **Branch per feature + PR (the retired rule).** Rejected for the single-operator reason
  above: it buys a review step that no second person performs, at the cost of ceremony on every
  feature. To be reinstated the moment a second contributor exists.
- **Leave `commit-policy.md` untouched and keep working on `main`.** Rejected outright: a
  governance document that states a false fact and prescribes an unfollowed rule teaches every
  future agent to distrust the harness.
- **Branch per feature without PRs.** Rejected as the worst of both — the ceremony of branching
  with none of the review benefit.

## References

- [`.harness/governance/commit-policy.md`](../../.harness/governance/commit-policy.md) (updated
  by this ADR) · [`.harness/rules/common/git.md`](../../.harness/rules/common/git.md)
- [`AGENTS.md`](../../AGENTS.md) golden rules 1, 6, 10.
