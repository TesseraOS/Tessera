# Release checklist

How a Tessera release is cut. Binding, like the rest of [governance](README.md).

**Publishing is a human action.** An agent may prepare a release completely — bump versions, write
changelogs, run every gate, produce tarballs and an SBOM — but **must not dispatch the release
workflow with `publish: true`**, and must not run `npm publish`, `changeset publish`, or `git push
--tags` without an explicit instruction for that specific release. Publishing is outward-facing and
irreversible: npm will not let a package name be reused after an unpublish.

## The model

- Everything is **Apache-2.0** and the whole repository is the open core
  ([ADR-0062](../../docs/adr/0062-apache-2-licence-whole-repo-oss-and-the-publish-closure.md)).
- **18 packages publish together** — `@tessera/cli`'s full dependency closure. They are `fixed` in
  [`.changeset/config.json`](../../.changeset/config.json), so they always share a version. A skew
  between them is an *install* failure on a user's machine, which no gate here can see.
- The publish set is derived from `private` in each manifest, never from a list. Making a package
  publishable means removing `private` and adding `publishConfig`; the tooling follows.
- Releases run only from [`.github/workflows/release.yml`](../../.github/workflows/release.yml) via
  **manual dispatch**, and the workflow does nothing irreversible unless `publish: true`.

## Before the release

1. **`main` is green.** The full gate set, not a subset:
   ```bash
   node scripts/verify-state.mjs && pnpm -w typecheck && pnpm -w lint && pnpm -w format:check && pnpm -w test && pnpm -w build && pnpm -w test:e2e && pnpm -w test:e2e:full
   ```
2. **No feature is `in_progress`** in [`feature_list.json`](../state/feature_list.json), and the
   tree is clean ([clean-state protocol](../protocols/clean-state.md)).
3. **Changelog entries exist** for everything user-visible since the last release
   (`pnpm changeset` per change; `pnpm exec changeset status` to see what will bump).
4. **Docs match the code.** The generated reference is drift-gated, but prose is not — check the
   README quickstart still runs, and that `SECURITY.md`'s supported-versions row is right.

## Cutting it

5. **Bump versions locally**, so the diff is reviewed by a person:
   ```bash
   pnpm version-packages
   ```
   Review the version bumps *and* the generated `CHANGELOG.md` files. Commit them.
6. **Dry run the release workflow** — dispatch with `publish` **off**. It re-runs the gates against
   the dispatched ref, packs every publishable package, and uploads the tarballs plus the SBOM.
7. **Open the artifacts.** Download `package-tarballs` and confirm: each contains `dist/` and
   `LICENSE`; none contains source `.ts`, tests, `.env`, or `node_modules`. Confirm the tarball
   count equals the publishable-package count.
8. **Prove the closure installs**, offline, before trusting it:
   ```bash
   node scripts/pack-publishable.mjs dist-packages
   ```
   then install every tarball by `file:` path into a scratch project and run
   `./node_modules/.bin/tessera doctor`. If the CLI cannot start from tarballs alone, the publish set
   is wrong — this is the check that catches a missing package, and nothing else does.

## Publishing (human only)

9. **Dispatch with `publish: true`.** Requires the `NPM_TOKEN` secret; provenance is attested via
   `id-token: write`.
10. **Verify from the outside.** In a clean directory, `npm i -g @tessera/cli && tessera doctor`.
    Check the npm page shows the provenance badge and Apache-2.0.
11. **Tag and record.** Tag the released commit, and add a `progress.md` entry with the version, the
    commit, and the artifact links.

## If it goes wrong

- **Do not unpublish** except for a leaked secret or a legal problem. Unpublishing breaks everyone
  who installed it, and the name/version is burned permanently. Publish a fixed patch instead.
- A bad release is a **new version**, never a re-publish of the same one.
- If a secret leaked: rotate it first, then unpublish, then treat it as an incident under
  [`secrets-policy`](secrets-policy.md) and [`SECURITY.md`](../../SECURITY.md).

## Supply chain (NFR-18)

Enforced in [`ci.yml`](../../.github/workflows/ci.yml) on every change, not only at release:

| Control | Mechanism |
|---|---|
| Dependency pinning | `pnpm-lock.yaml` is committed; CI installs with `--frozen-lockfile`, so a resolution that drifts fails the build. |
| Vulnerability audit | Trivy over `pnpm-lock.yaml` at CRITICAL/HIGH, `exit-code: 1` ([ADR-0052](../../docs/adr/0052-dependency-audit-via-trivy-not-pnpm-audit.md)). |
| SBOM | CycloneDX per run, retained 90 days (365 on a release). Same tool as the audit, so both describe the same resolution. |
| Secret scanning | gitleaks over full history. |
| Provenance | `publishConfig.provenance` on all 18 published packages; attested by GitHub OIDC at publish. |
| Action pinning | Actions are pinned to release tags (`@v4`, `@v0.36.0`). Pinning to commit SHAs is stricter and is a deliberate open item, not an oversight. |

## Not covered here

- **Container images** — needs the build from **F-093**; image signing lands with it.
- **Domain and trademark verification** — external legal facts, owned by **F-069**. Do not assert
  brand clearance from this checklist.
