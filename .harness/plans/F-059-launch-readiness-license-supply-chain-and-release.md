# Plan: F-059 Launch readiness — licence, supply chain, release process, repo polish

- **Feature:** F-059 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-18 (supply-chain security), NFR-15 (CI/CD)
- **Service / package:** root (repo-wide) + `.github/workflows` + every `package.json`
- **Author:** Claude (lead) · **Date:** 2026-07-27

## Intent

Make the repository publishable and legible to an outsider: a licence that actually exists, a
documented open-core boundary, a vulnerability-reporting policy, an SBOM in CI, versioning and
changelog tooling, and a release workflow that can publish `@tessera/*` with provenance. "Done" for a
user: they can read what they are allowed to do with Tessera, report a vulnerability, see what is in
the dependency tree, and — when the operator chooses to run it — install a released package.

## Decisions taken by the lead (this session, via AskUserQuestion)

1. **Apache-2.0** for the OSS core. Express patent grant and a trademark section, which matters
   because ADR-0008 locks the Tessera brand and a hosted tier is planned under it. `NOTICE.md`
   already exists and is Apache's native convention.
2. **The whole repository is OSS.** The commercial tier is the hosted service, its operations, and
   future enterprise features — none of which live here. `@tessera/billing` already ships an open
   local/free adapter; carving it out would fragment a package that works end to end today.
3. **Release is `workflow_dispatch` with `publish: false` by default.** Without an explicit
   `publish: true` the job builds, packs, and generates the SBOM but stops short of `npm publish`.
   No tag can publish by accident, and the pipeline can be proven green before anything is
   irreversible.

## The recorded publish set is wrong, and would ship a broken CLI

The feature's `notes` (from F-054) say the publish set is `@tessera/sdk` + `@tessera/cli`, with
`@tessera/skills` added because the CLI imports it at runtime. That found **one link of the chain**.

`@tessera/cli` declares seven `@tessera/*` dependencies (`api`, `config`, `core`, `ingestion`,
`observability`, `server`, `skills`), and their transitive closure — computed, not estimated — is
**18 packages**: ai, api, billing, cli, config, context-compiler, core, ingestion, knowledge-graph,
mcp, memory, observability, plugin-host, retrieval, sdk, server, skills, storage.

Publishing three of them means `npm i -g @tessera/cli` resolves `@tessera/api@0.0.0` from the public
registry, finds nothing, and fails. **A release that cannot be installed is not a release.** Two ways
out, and the plan picks one in increment 5:

- **(A) Publish the whole closure** — 18 packages, one version line, changesets handles the bumps.
  Consistent with decision 2 (the whole repo is OSS anyway) and keeps every package independently
  consumable. Cost: 18 npm names to hold, and every internal refactor is a public API change.
- **(B) Bundle the CLI** — `@tessera/cli` builds to a self-contained `dist` with its workspace deps
  inlined, so only `sdk` + `cli` publish. Smaller public surface; cost is a bundler in the build and
  a CLI whose stack traces point into bundled code.

**Recommendation: (A).** Decision 2 already makes the whole repo open, so there is no boundary that
(B) protects, and (B) would leave `@tessera/server` unusable to anyone self-hosting from npm — which
FR-50/FR-53 promise. Recorded in the ADR either way, because it is exactly the sort of thing that
looks like a detail and decides whether the first release works.

## Approach

Reuse first: the existing `ci.yml` structure (verify / security / secret-scan jobs, ADR-0052's Trivy
policy) is extended rather than replaced; `NOTICE.md` already exists and is kept as the third-party
attribution file Apache expects; `verify-state` already gates governed-doc links, so new governance
docs are link-checked for free.

New: `LICENSE` (Apache-2.0 verbatim), `SECURITY.md`, `CHANGELOG` via changesets, an `sbom` CI job
(CycloneDX), `.github/workflows/release.yml`, and a release checklist under
[`../governance/`](../governance/).

## Increments

| # | Increment | Proof |
|---|-----------|-------|
| 0 | Plan + **ADR-0062** (licence, open-core boundary, publish-set closure, release trigger) + claim | `verify-state` |
| 1 | `LICENSE` (Apache-2.0) + `license: "Apache-2.0"` on all 26 `package.json` + root; `NOTICE.md` reviewed for Apache §4(d) completeness | `verify-state`, build |
| 2 | `SECURITY.md` — supported versions, reporting channel, disclosure timeline | link-check |
| 3 | README rewritten for launch (**verify the stale finding first** — the acceptance says it "still says pre-coding"; it does not, it was updated) | link-check |
| 4 | SBOM job in CI (CycloneDX, uploaded as an artifact) + dependency-pinning policy stated | CI syntax check + local dry run |
| 5 | Changesets + the publish-set decision applied (`private` flags, `publishConfig`, `repository`/`homepage`/`bugs` fields) | build; `pnpm pack` proves each tarball's contents |
| 6 | `release.yml` — `workflow_dispatch`, `publish` input defaulting **false**, `npm publish --provenance`, packs + SBOM on every run | dry run locally; **not executed against npm** |
| 7 | Release checklist in `.harness/governance/` + `verify-state` link coverage | `verify-state` |
| 8 | Brand/domain checklist: record what is verifiable in-repo, **defer the external legal facts to F-069** | `verify-state` |
| 9 | Effects (E-005), progress, memory, status → done | full gates |

## Files to touch

- `LICENSE`, `SECURITY.md`, `NOTICE.md`, `README.md`, `CHANGELOG.md` (generated).
- Every `package.json` (26 + root) — `license`, and for the publish set `private`, `publishConfig`,
  `repository`, `homepage`, `bugs`.
- `.github/workflows/ci.yml` (SBOM job), `.github/workflows/release.yml` (new).
- `.changeset/config.json` (new), `.harness/governance/release-checklist.md` (new).
- `docs/adr/0062-*.md`, `docs/adr/README.md`, `.harness/state/*`.

## Anticipated effects

- **E-005** (`gates.json` ↔ CI mirror) — new CI jobs must not break the mirror guard that
  `verify-state` enforces. SBOM and release are **not** verification gates; they must be added
  without being mistaken for one.
- New effect candidate: the **published-artifact contract** (which packages are public, their
  `files`/`exports`, and the version line) — a change there breaks installs rather than builds, which
  is invisible to every existing gate. To be recorded in increment 9.

## Test plan

There is no unit-testable logic here; the proof is different in kind and must not be faked:

- `pnpm pack --dry-run` per published package — asserts the tarball actually contains `dist` and that
  no source or secret leaks in.
- A **local install smoke test**: pack the closure into a temp dir and `npm i` the CLI tarball from
  disk, proving the dependency closure resolves without the registry.
- CI workflow YAML validated by `actionlint` (or a parse check) before commit — a broken workflow
  fails on the operator's first release, not on mine.
- `verify-state` for state/link/CI-mirror integrity.

## Verification

`node scripts/verify-state.mjs`, `pnpm -w build`, plus the packaging proofs above. The feature's
declared gates are `state` + `build`; the full gate set still runs before the closing commit since
every `package.json` is touched.

## Risks / open questions

1. **I will not run `npm publish`.** Publishing is outward-facing and irreversible (npm names cannot
   be reused after unpublish). The workflow is built and proven up to the publish step; executing it
   is the operator's action. Recorded as such rather than reported as "released".
2. **Trademark/domain verification is not mine to assert.** The acceptance's "domain + trademark
   verified" needs external legal facts, which is precisely what **F-069** exists for. Increment 8
   records the in-repo checklist and states the dependency; claiming verification would be
   fabrication.
3. **Version `0.0.0` everywhere.** The first release needs a deliberate starting version; changesets
   makes it explicit. `0.1.0` is proposed in the ADR, not assumed here.
4. **Scope creep flagged, not planned:** container image signing (needs the images from **F-093**),
   contributor licence agreements, and a public issue-template overhaul.
