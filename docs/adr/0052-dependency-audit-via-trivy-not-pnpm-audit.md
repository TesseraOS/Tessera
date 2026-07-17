# ADR-0052: The dependency audit runs on Trivy, not `pnpm audit` — and stays at HIGH+

- **Status:** Accepted
- **Date:** 2026-07-17
- **Deciders:** maintainer (dev-AshishRanjan), Claude Opus 4.8
- **Tags:** security, ci, dependencies, verification

## Context

CI's `security` job ran `pnpm audit --audit-level=high`. On 2026-07-17 it began failing with:

```
ERR_PNPM_AUDIT_BAD_RESPONSE  The audit endpoint (at
https://registry.npmjs.org/-/npm/v1/security/audits) responded with 410:
{"error":"This endpoint is being retired. Use the bulk advisory endpoint instead..."}
```

Verified rather than assumed:

**1. The endpoint is gone, permanently.** npm retired the legacy audit endpoints
(`/-/npm/v1/security/audits` and `/-/npm/v1/security/audits/quick`) after a brownout that ended
**2026-07-15**. This is not a transient registry fault and there is nothing to wait for.

**2. No pnpm release on our line will ever fix it.** The migration to the replacement bulk endpoint
(`/-/npm/v1/security/advisories/bulk`) landed in **pnpm 11.0** (PR pnpm/pnpm#11268) and was **not**
backported: the entire 9.x and 10.x lines call the retired endpoints. We pin `pnpm@9.3.0`.

**3. The gate was failing OPEN, and hiding real vulnerabilities.** A 410 is neither a pass nor a
fail — the step just errored, so nothing was being audited. Querying npm's bulk endpoint directly
against `pnpm-lock.yaml` (896 packages) found **22 advisories**, including:

| Severity | Package | Advisory |
|----------|---------|----------|
| **critical** | `vitest@2.1.9` (`<3.2.6`) | [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) — Vitest UI server: arbitrary file read/execute |
| **high** | `vite@5.4.21` (`<=6.4.2`) | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) — `server.fs.deny` bypass on Windows |

Both traced to a single root devDependency, `vitest: "^2"`. **`vite` was declared by nobody** — it
existed only as an auto-installed peer, which is precisely why a vulnerable version sat in the tree
unnoticed and unowned.

**4. OSV-Scanner cannot express our policy.** It was the first choice, but it has **no severity
threshold** (google/osv-scanner#1400 is an open feature request) — it fails on every known advisory.
Adopting it would have silently replaced "no high+" with "no known vulnerabilities at any severity",
red-lining CI on 17 moderate advisories as a *side effect of a CI repair*.

## Decision

**1. The audit runs on `aquasecurity/trivy-action@v0.36.0`, reading `pnpm-lock.yaml` directly**, at
`severity: CRITICAL,HIGH` with `exit-code: 1`.

**2. The policy does not change.** `CRITICAL,HIGH` is exactly what `--audit-level=high` enforced.
Tightening the bar is a separate, deliberate decision — not something smuggled in with a repair.

**3. We stay on `pnpm@9.3.0`.** The pnpm 11 migration is real work with its own breaking changes
(pure ESM, `.npmrc` becomes auth/registry-only, `npm_config_*` → `pnpm_config_*`, `allowBuilds`
consolidation, `ignoreCves` → `ignoreGhsas`) and belongs in its own planned, verified feature.

**4. The advisories the restored gate found are fixed, not ignored:** `vitest ^2 → ^4`
(4.1.10 ≥ 3.2.6, clearing the critical) and `@vitejs/plugin-react ^4.7.0 → ^6.0.3` (the only peer it
requires is `vite ^8`).

**5. `vite` is now an explicit devDependency (`^8`)** in the root, `apps/web`, and `tests/bench`.
Declaring `vitest ^4` alone did **not** clear the high: pnpm reused the locked `vite@5.4.21` to
satisfy the auto-installed peer, so the vulnerable version survived the upgrade silently. A required
peer that no one declares is a dependency no one owns.

## Consequences

### Positive

- **The gate can pass or fail again**, on the tree's actual health. It had been doing neither.
- **One critical and one high are gone.** Re-querying the bulk endpoint after the upgrade returns
  **no critical and no high** advisories; the `esbuild` moderate cleared too (vite 8 pulls
  esbuild 0.28.1). Verified against the updated lockfile, not inferred from version numbers.
- **No dependency on a registry audit endpoint.** Trivy reads the lockfile and its own OSV-backed DB.
  A vendor retiring an endpoint can no longer take this gate down — the failure mode that caused this
  ADR cannot recur in the same shape.
- **The `security` job needs no toolchain.** No `pnpm/action-setup`, no `setup-node`, no
  `pnpm install --frozen-lockfile` — checkout and scan. Fewer moving parts, and faster.
- **`vite` is owned.** Its version is now a visible, reviewable line in a `package.json` instead of an
  invisible peer resolution.

### Negative / Costs

- **A third-party action joins the trust boundary.** Pinned to the `v0.36.0` tag, matching the
  convention the other actions in `ci.yml` already use (`actions/checkout@v4`,
  `gitleaks/gitleaks-action@v2`). SHA-pinning every action is a worthwhile hardening pass — repo-wide,
  deliberately, not for one job.
- **Trivy pulls its vulnerability DB from ghcr.io**, which can rate-limit. A trade against `pnpm
  audit`'s dependence on a registry endpoint that is now *permanently gone*.
- **Advisory data comes from a different source** (Trivy/OSV rather than the npm advisory DB). The
  two are close but not identical, so the exact advisory set may shift slightly.
- **17 moderate + 3 low advisories remain unfixed and unreported by this gate** — mostly transitive
  `dompurify`, plus `postcss@8.4.31`. This is not new (it is the policy the repo already had), but it
  is now *known* rather than merely unmeasured. Recorded honestly here rather than left implied.
- **vitest 2 → 4 crosses two majors.** The full `test` gate was run to prove it: **36/36 tasks green,
  368 tests passing in `apps/web` alone, with no test or config changes required.**

### Neutral / Follow-ups

- **The pnpm 11 migration** should be planned as its own feature. It would make `pnpm audit` viable
  again, but this ADR would not automatically be reversed: a lockfile-native scanner that owes nothing
  to a registry endpoint is the more durable arrangement regardless.
- **The moderate/low advisories deserve their own pass** — chiefly a `dompurify` bump, which is
  transitive and may need a `pnpm.overrides` entry.
- **SHA-pinning third-party actions** is worth doing across `ci.yml` as one deliberate change.

## Alternatives considered

- **Upgrade to pnpm 11 now.** The only route that keeps `pnpm audit`. Rejected as sequencing, not
  merit: a two-major package-manager migration with real breaking changes, run as a hotfix for a red
  CI, would put the whole toolchain at risk to repair one job. It deserves a plan and a full re-verify.
- **OSV-Scanner** (the initial choice). Rejected on evidence: no severity threshold, so it cannot
  express "high and above". It would have changed the policy by accident and failed on 17 moderates.
- **OSV-Scanner plus an ignore file.** Rejected: ~20 hand-maintained exception entries that rot into
  rubber-stamps. A gate nobody trusts is worse than no gate.
- **`npm audit` against a generated `package-lock.json`.** Rejected as dishonest — npm's resolution is
  not pnpm's, so it would audit a tree we do not ship.
- **`audit-ci` / `better-npm-audit`.** Both wrap the same retired endpoints. Same 410.
- **Drop the audit until pnpm 11 lands.** Rejected: it would formalise the failing-open that let a
  critical sit in the tree, and NFR-15/ADR-0010 require the gate.

## References

- Related: `ADR-0010` (CI gates + branch protection), `ADR-0021` (frontend budgets/a11y).
- Upstream: [pnpm/pnpm#11265](https://github.com/pnpm/pnpm/issues/11265) (the 410),
  [pnpm/pnpm#11268](https://github.com/pnpm/pnpm/pull/11268) (bulk-endpoint fix, milestone v11.0),
  [pnpm 11 release notes](https://pnpm.io/blog/releases/11.0),
  [google/osv-scanner#1400](https://github.com/google/osv-scanner/issues/1400) (no severity threshold),
  [npm Audit API docs](https://api-docs.npmjs.com/#tag/Audit).
- Code: `.github/workflows/ci.yml` (`security` job), `package.json`, `apps/web/package.json`,
  `tests/bench/package.json`.
