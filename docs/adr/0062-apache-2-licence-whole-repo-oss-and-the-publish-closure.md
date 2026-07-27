# ADR-0062: Apache-2.0, the whole repository is the open core, the publish set is the CLI's full 18-package closure, and releases are manually dispatched with publish off by default

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Project lead, Claude
- **Tags:** licensing, open-core, supply-chain, release, launch

## Context

**OQ4** resolved on 2026-07-03 to *open-core: a permissive-OSS core plus a paid Managed Cloud /
enterprise tier*. It never named a licence, never drew the boundary, and no licence file was ever
written. F-059 is where that becomes real, and the starting position is that **nothing exists**: no
`LICENSE`, no `SECURITY.md`, no `license` field on any of the 26 workspace packages, no SBOM, no
versioning tooling, and no release workflow. Every package is `private: true` and versioned `0.0.0`.

NFR-18 requires SBOM generation, pinned + audited dependencies, licence compliance, and
signed/verifiable published artifacts; NFR-15 requires releases to build and publish deployment
artifacts. ADR-0052 already moved the dependency audit to Trivy over `pnpm-lock.yaml`.

## Decision

### 1. The OSS licence is **Apache-2.0**

Over MIT, for two properties this project specifically needs:

- an **express patent grant** with a retaliation clause, which a repository shipping retrieval,
  ranking and compilation machinery should not leave implicit; and
- an explicit **trademark section**, which matters because ADR-0008 locks the *Tessera* brand and a
  hosted tier is planned under that name. MIT says nothing about marks — a competitor could fork and
  ship under the same name without the licence being any obstacle.

`NOTICE.md` already exists and is Apache's native attribution convention, so the third-party
attribution story (ECC, MIT) needs no restructuring.

BSL / source-available was considered and rejected: it is not permissive, so it contradicts OQ4 as
resolved and would require reopening it.

### 2. **The whole repository is the open core.** The commercial tier is the service, not a package

Every package in this monorepo ships under Apache-2.0. What is sold is the **hosted service, its
operation, and future enterprise features** — none of which live in this repository.

The alternative — carving `@tessera/billing` and the cloud adapters out as proprietary — was
rejected because it fragments a package that works end to end in the open today: `createLocalBilling`
is the OSS default that makes a self-hosted deployment behave sensibly, and splitting the package
would mean a licence boundary running through one directory for no protection that the hosted tier
does not already have.

This makes "open-core" mean *open core, commercial service* rather than *open core, closed modules*.
Stated plainly here so nobody later reads OQ4's phrasing as promising a proprietary carve-out that
does not exist.

### 3. The publish set is the CLI's **full transitive closure — 18 packages**, not 3

The feature's recorded note (from F-054) said the publish set is `@tessera/sdk` + `@tessera/cli`,
with `@tessera/skills` added because the published CLI imports it at runtime. That found **one link
of the chain**.

`@tessera/cli` declares seven `@tessera/*` dependencies; their computed closure is **18 packages**:
`ai`, `api`, `billing`, `cli`, `config`, `context-compiler`, `core`, `ingestion`,
`knowledge-graph`, `mcp`, `memory`, `observability`, `plugin-host`, `retrieval`, `sdk`, `server`,
`skills`, `storage`.

Publishing three of them means `npm i -g @tessera/cli` tries to resolve `@tessera/api` from the
public registry, finds nothing, and fails. **A release that cannot be installed is not a release**,
and this failure appears only at install time — no build, typecheck or test in this repository can
see it, because inside the workspace `workspace:*` always resolves.

Bundling the CLI's dependencies into its own `dist` (publishing only 2 packages) was the alternative.
Rejected: decision 2 already opens the whole repository, so there is no boundary bundling would
protect, and it would leave `@tessera/server` unusable to anyone self-hosting from npm — which
FR-50/FR-53 explicitly promise.

Consequence accepted: 18 npm names to hold, and internal refactors across package boundaries become
public API changes. That is the honest cost of shipping a monorepo as libraries.

### 4. Releases are **`workflow_dispatch` with `publish: false` by default**

The release workflow always builds, packs, and generates the SBOM. It runs `npm publish
--provenance` **only** when dispatched with an explicit `publish: true`.

Tag-triggered publishing was rejected for a first release: pushing `v0.1.0` would publish
immediately, and npm package names cannot be reused after an unpublish. A dry run that produces
every artifact except the irreversible one is what lets the pipeline be proven before it is trusted.

The first version is **`0.1.0`**, not `1.0.0` — the API surface is young and `1.0.0` is a promise
about stability this project has not yet earned.

## Consequences

### Positive

- The repository states what may be done with it, in a licence with a patent grant and a trademark
  clause aligned to the brand decision in ADR-0008.
- The first release will actually install, because the publish set was computed rather than assumed.
- No accidental publish is reachable: the irreversible step requires a deliberate input.
- SBOM + provenance satisfy NFR-18's verifiable-artifact clause with evidence rather than intent.

### Negative / Costs

- 18 public package names to register and defend, and cross-package refactors become semver events.
- Apache-2.0's NOTICE obligations require `NOTICE.md` to stay accurate as dependencies change.
- Publishing remains **unproven against the real registry** until an operator dispatches it; this ADR
  does not claim otherwise.

### Neutral / Follow-ups

- Container image signing needs the images from **F-093**; out of scope here.
- Domain and trademark *verification* needs external legal facts and belongs to **F-069**. F-059
  records the checklist and the dependency; it does not assert the verification.
- A contributor licence agreement, if ever wanted, is a separate decision.

## Alternatives considered

- **MIT.** Shorter, and matches ECC (the one vendored attribution). No patent grant, no trademark
  clause. Rejected on §1's two properties.
- **BSL 1.1 / source-available.** Would block competing hosted offerings, but is not permissive and
  contradicts OQ4 as resolved. Rejected without reopening OQ4.
- **Proprietary billing/cloud packages.** Rejected in §2 — a licence boundary through a working
  package, protecting nothing the service does not already protect.
- **Bundle the CLI, publish 2 packages.** Rejected in §3 — breaks self-hosting from npm.
- **Tag-triggered release.** Rejected in §4 — the first tag would be a live, irreversible publish.

## References

- Implements F-059 (NFR-18, NFR-15). Touches effect **E-005** (gates ↔ CI mirror).
- Related: `docs/PRD.md` OQ4 + NFR-15/NFR-18;
  [ADR-0008](0008-brand-tessera-and-package-scope.md) (brand + `@tessera/*` scope),
  [ADR-0010](0010-ci-cd-github-actions.md),
  [ADR-0011](0011-billing-dodo-payments.md) (billing is cloud-only behind a port),
  [ADR-0052](0052-dependency-audit-via-trivy-not-pnpm-audit.md) (audit policy),
  [ADR-0059](0059-self-hosted-profile-and-deployment-artifacts.md) (deployment artifacts, F-093).
