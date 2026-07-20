# Fix — gitleaks fails in CI due to missing license key for organizations

- **Author:** Antigravity · **Date:** 2026-07-21
- **Type:** bug fix (CI workflow), not a feature — no `F-` id.

## Symptom

1. The `secret-scan` job in GitHub Actions fails with the following error:
```
[TesseraOS] is an organization. License key is required.
Error: 🛑 missing gitleaks license. Go grab one at gitleaks.io and store it as a GitHub Secret named GITLEAKS_LICENSE.
```
Even though the secret `GITLEAKS_LICENSE` has been added to the organization secrets, the job continues to fail with this error.

2. Additionally, running the local verification/typecheck gate (`pnpm typecheck`) fails on `@tessera/docs#typecheck` with:
```
tests/compose-doc-drift.test.ts(37,35): error TS2532: Object is possibly 'undefined'.
tests/compose-doc-drift.test.ts(37,65): error TS2532: Object is possibly 'undefined'.
tests/compose-doc-drift.test.ts(52,3): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
```

3. Verification of harness state on CI fails with a broken relative link error:
```
✗ state invalid — 1 problem(s):
  - doc-links: .harness/state/progress.md → broken relative link "file:///E:/ContextOS/.harness/plans/fix-gitleaks-license.md"
```

4. The CI dependency security audit (`security` job running `trivy-action`) fails on a CVE vulnerability in `adm-zip` v0.5.17:
```
pnpm-lock.yaml (pnpm)
=====================
Total: 1 (HIGH: 1, CRITICAL: 0)

 adm-zip │ CVE-2026-39244 │ HIGH     │ fixed  │ 0.5.17            │ 0.6.0         │ adm-zip: Denial of Service via crafted ZIP file
```

## Root cause

1. In `.github/workflows/ci.yml`, under the `secret-scan` job's `Secret scan (gitleaks)` step, the environment variable `GITLEAKS_LICENSE` is not populated. GitHub Actions does not automatically inject organization or repository secrets as environment variables into workflow steps. The workflow file must explicitly bind the secret to an environment variable via `${{ secrets.GITLEAKS_LICENSE }}`.

2. In `apps/docs/tests/compose-doc-drift.test.ts`, the TypeScript configuration enforces `noUncheckedIndexedAccess: true`. Directly indexing `lines[start]` or the regular expression group `match[1]` yields a `string | undefined` type, causing type-assignment compatibility errors.

3. The absolute link `file:///E:/ContextOS/.harness/plans/fix-gitleaks-license.md` added in `progress.md` is invalid in CI environments and violates relative-link constraint checks enforced by `verify-state.mjs`.

4. `onnxruntime-node@1.24.3` specifies `adm-zip@0.5.17` as a dependency, which contains the HIGH severity security vulnerability CVE-2026-39244.

## Fix

1. Modify `.github/workflows/ci.yml` in the `secret-scan` job to pass `GITLEAKS_LICENSE` explicitly as an environment variable in the gitleaks step:

```yaml
      - name: Secret scan (gitleaks)
        uses: gitleaks/gitleaks-action@v2
        env:
          GITLEAKS_CONFIG: .gitleaks.toml
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
```

2. Safely guard array index access and group matches in `apps/docs/tests/compose-doc-drift.test.ts` to satisfy compiler strictness under `noUncheckedIndexedAccess: true`.

3. Fix the link in `.harness/state/progress.md` to be relative: `../plans/fix-gitleaks-license.md`.

4. Enforce upgrading `adm-zip` to `0.6.0` by adding a `pnpm.overrides` block in the root `package.json` and running `pnpm install` to update the lockfile.

## Verification

1. Run the local verification script to verify harness state:
   ```bash
   node scripts/verify-state.mjs
   ```
2. Run standard lint/format/typecheck/test gates to ensure no regressions:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm format:check
   pnpm test
   pnpm build
   ```

## Effects

No shared runtime contracts or package APIs are changed. The modification is isolated to CI workflows, documentation links, and project dependencies. Since `.github/workflows/ci.yml` is tracked under effect-link `E-005` (from `.harness/verification/gates.json`), we confirm that the change does not alter any gates defined in `gates.json`. The `pnpm.overrides` is mapped in `package.json` to upgrade a third-party transitively-required dependency (`adm-zip`) to resolve the security vulnerability (`CVE-2026-39244`).
