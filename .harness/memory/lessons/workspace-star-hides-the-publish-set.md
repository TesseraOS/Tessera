---
id: workspace-star-hides-the-publish-set
kind: lesson
title: A monorepo cannot see its own publish set — `workspace:*` always resolves, so only an install proves it
links:
  - .changeset/config.json
  - scripts/pack-publishable.mjs
  - .harness/governance/release-checklist.md
  - docs/adr/0062-apache-2-licence-whole-repo-oss-and-the-publish-closure.md
confidence: 1
created: 2026-07-27
---

**What happened:** F-059 inherited a recorded publish set — `@tessera/sdk` + `@tessera/cli` +
`@tessera/skills`, the third added by F-054 after noticing the CLI imports it at runtime. That found
**one link of the chain**. `@tessera/cli` declares seven `@tessera/*` dependencies whose transitive
closure is **eighteen packages**. Publishing three would have shipped a CLI that fails on
`npm install` with `404 '@tessera/api@0.0.0' is not in this registry`.

**Why it was invisible:** inside the workspace, `workspace:*` always resolves. Typecheck, lint, test,
build, e2e and the full-stack e2e are all green with a wrong publish set, because none of them
installs from a registry. pnpm rewrites `workspace:*` to a concrete version **at pack time**, so the
hard requirement on `@tessera/api@0.0.0` does not exist in any file you can read in the repo — it is
created by the packing step and discovered by a user.

This is a whole *class*: a contract that breaks **installs rather than builds**. The existing gates
are all build-shaped, so they are structurally blind to it. Recorded as effect **E-030**.

**How to apply:**

1. **Compute the closure, never list it.** Walk `dependencies` transitively from each published
   entry point. A hand-maintained list is exactly what went wrong here — and `scripts/pack-publishable.mjs`
   now derives the set from `private` in each manifest so it cannot drift from what
   `changeset publish` pushes.
2. **Prove it by installing, offline, both ways.** Pack every candidate, install the tarballs by
   `file:` path into a scratch project, and run the binary (`tessera doctor`). Then run the
   **negative control** — install only the set you doubted and watch it 404. A positive result alone
   does not show the old set was wrong.
3. **Audit tarball contents, not just that packing succeeded.** Each should carry `dist` + `LICENSE`
   and no source `.ts`, tests, `.env` or `node_modules`. Beware pattern false positives: a `secret`
   grep hits `dist/secrets/*.js`, which is the SecretsProvider *code*.
4. **Version-lock the closure.** Changesets `fixed`, not `linked`: a version skew between packages
   that depend on each other is an install failure, not a build failure.
5. More generally — when a change's failure mode is outside the repository (install, deploy, DNS,
   registry), no in-repo gate will catch it. Write the out-of-band proof and make it a required step
   in the checklist, or it will not be run again.

See [[a-decision-is-not-implemented-until-the-composition-root-implements-it]] (same shape: the
artifact that decides the truth is not the one the tests read) and [[engineering-standards]].
