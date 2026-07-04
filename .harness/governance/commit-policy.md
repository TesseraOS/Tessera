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
- Established repo with a remote: **branch per feature** (`feat/F-00x-slug`), open a PR;
  don't push feature work straight to the default branch.
- This repo currently has **no remote**; the genesis/initial commit on `main` is fine.
  Re-evaluate when a remote is added (an ADR if the model changes).

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
