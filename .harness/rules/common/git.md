# Rule: Git & version control (common)

See also the binding [commit policy](../../governance/commit-policy.md).

## Commits
- **Commit each completed, verified increment** (standing authorization — see the
  [commit policy](../../governance/commit-policy.md)); never commit red or half-applied
  states, and **never push without an explicit user request**.
- **Conventional Commits**: `type(scope): subject` —
  e.g. `feat(retrieval): add BM25 keyword retriever`. Types: `feat, fix, docs, refactor,
  test, chore, perf, build, ci`.
- One logical change per commit; green build per commit.
- Subject in imperative mood, ≤ 72 chars; body explains *why*.
- Co-authorship trailer for agent-authored commits (see commit policy).

## Branches
- Don't commit feature work directly to a shared default branch in an established repo;
  branch per feature (`feat/F-00x-short-slug`) once a remote/PR flow exists.
- The current local repo has no remote yet; the **initial/genesis commit on `main` is
  acceptable**. Reassess when a remote is added.

## What is committed vs ignored
- **Committed (system of record):** `feature_list.json`, `effects.json`, `progress.md`,
  `plans/`, `.harness/memory/`, `docs/`, source, tests, configs.
- **Never committed:** secrets, `.env*`, `node_modules`, build output, local DB/vector
  files, `.claude/settings.local.json`. Enforced by [`.gitignore`](../../../.gitignore).

## Never
- Never `--no-verify`, never bypass signing, never force-push shared history, never
  `git add -A` blindly without reviewing what's staged.
