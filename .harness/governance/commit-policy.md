# Policy: Commit & version control

Binding. See also the [git rule](../rules/common/git.md).

## When to commit
- **Standing cadence (project-lead authorization, in practice since R0; codified
  2026-07-04):** commit each **completed, verified increment** proactively — a green
  feature increment, a finished feature, or a coherent docs/state update — without asking
  again each time. This supersedes the original "only when asked" default, which had
  drifted from months of authorized practice (files are the system of record, so the
  written policy now matches reality).
- **Guardrails on every commit (non-negotiable):**
  - only **green** states are committed (gates run, evidence recorded — never a red build,
    never a half-applied multi-file edit);
  - review the staged diff first — no blind `git add -A`;
  - **pushing, force-pushing, and anything touching a remote still require an explicit
    user request, every time.**
- One logical change per commit; the build is green at each commit.

## Message format (Conventional Commits)
```
type(scope): imperative subject (≤72 chars)

Why this change (body, wrapped ~72). Reference FR-*/NFR-* and feature ids.

Co-Authored-By: <agent> <email>
```
Types: `feat, fix, docs, refactor, test, chore, perf, build, ci`.
Agent-authored commits include the agent co-author trailer.

## Branching
- **Trunk-based on `main`** ([ADR-0055](../../docs/adr/0055-trunk-based-main-with-a-remote.md)).
  A remote exists (`origin` → GitHub), and the earlier "no remote, so `main` is fine" premise
  is retired along with the branch-per-feature + PR rule it was paired with: with a single
  operator, a PR adds ceremony without adding a reader, and the independent check that actually
  catches defects here is the **evaluator pass**, which is orthogonal to branching.
- The guardrails above are what carry the quality bar instead — only green states, reviewed
  diffs, one logical change per commit. **Known cost, accepted:** no pre-merge CI signal, so
  run the gates locally *before* committing and record the evidence.
- **Revisit the moment a second contributor joins** — ADR-0055's rationale is explicitly a
  single-operator argument and does not survive a second author.

## Committed vs ignored (system of record)
**Commit:** source, tests, configs, [`docs/`](../../docs/), and the harness system of
record — [`state/feature_list.json`](../state/feature_list.json),
[`state/effects.json`](../state/effects.json), [`state/progress.md`](../state/progress.md),
[`plans/`](../plans/), [`memory/`](../memory/), and `.claude/settings.json`.

**Never commit:** secrets, `.env*`, `node_modules`, build output, local DB/vector data,
`.claude/settings.local.json`, scratch files. Enforced by
[`.gitignore`](../../.gitignore) — review staged changes before every commit.

## Prohibited
`--no-verify`; bypassing signing; force-pushing shared branches; committing failing builds;
blind `git add -A` without reviewing the diff.
