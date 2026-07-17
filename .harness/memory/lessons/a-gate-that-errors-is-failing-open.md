---
id: a-gate-that-errors-is-failing-open
kind: lesson
title: A gate that ERRORS is failing open — `pnpm audit`'s 410 hid a live critical + high, and the vulnerable dep was one nobody declared
links:
  - .github/workflows/ci.yml
  - docs/adr/0052-dependency-audit-via-trivy-not-pnpm-audit.md
  - scripts/verify-state.mjs
confidence: 1
created: 2026-07-17
---

**What happened:** CI's `security` job died with `ERR_PNPM_AUDIT_BAD_RESPONSE … responded with 410:
"This endpoint is being retired."` The easy read is "npm broke our CI." The real finding was worse.

A 410 is **neither a pass nor a fail** — the step just errored, so **nothing was being audited**.
Querying npm's bulk endpoint directly against `pnpm-lock.yaml` found **22 advisories**, including a
**critical** (`vitest@2.1.9 <3.2.6` — Vitest UI arbitrary file read/execute) and a **high**
(`vite@5.4.21 <=6.4.2`). The gate had been *hiding* them, not guarding against them.

**The trap in the fix:** bumping `vitest ^2 → ^4` did **not** clear the high. `vite` was declared by
**nobody** — it existed only as an auto-installed peer, so pnpm reused the locked `vite@5.4.21` to
satisfy the new range and the vulnerable version survived the upgrade **silently**. Only declaring
`vite: "^8"` explicitly (root, `apps/web`, `tests/bench`) moved it. **A required peer that nobody
declares is a dependency that nobody owns — and nobody upgrades.**

**Why it went unnoticed for so long:** `verify-state.mjs`'s ci-mirror guard (E-005) enforces that every
**active gate in `gates.json`** has a matching CI step. The `security` job is **not** a gates.json gate,
so gate 0 could not see it break. The guard protects what it enumerates and nothing else.

**Fix:** Trivy (`aquasecurity/trivy-action@v0.36.0`) reads `pnpm-lock.yaml` directly at
`severity: CRITICAL,HIGH` — no registry audit endpoint, no toolchain, no install step. Policy held at
HIGH+ deliberately: that is what `--audit-level=high` meant, and widening it during a repair would have
changed the bar by accident. ADR-0052 carries the reasoning. Both high-severity advisories fixed, not
ignored; all 10 gates re-run green.

**How to apply:**

- **Distinguish red / green / errored.** An errored gate is failing OPEN and is more dangerous than a
  red one, because it *looks* like infrastructure noise. When a security step starts erroring, the
  first question is "what is it no longer telling me?" — not "how do I make the error go away."
- **Never assume a version bump moved a transitive dep.** Re-query the advisory data against the
  **updated lockfile** and prove it. `pnpm why <pkg>` + `grep '^  <pkg>@' pnpm-lock.yaml` show what
  actually resolved; peers are reused from the lock and will sit still while you "upgrade."
- **Repairing a gate must not silently change its policy.** OSV-Scanner was the first choice and had to
  be rejected on evidence: it has **no severity threshold** (google/osv-scanner#1400), so it would have
  swapped "no high+" for "no known vulns at any severity" and red-lined CI on 17 moderates — a policy
  change smuggled in as a bugfix. Tighten the bar deliberately or not at all.
- **Prefer tooling that owes nothing to a vendor endpoint.** `pnpm audit`, `npm audit`, `audit-ci` and
  `better-npm-audit` all call the same retired endpoints; the fix landed **only in pnpm 11** and was
  never backported to 9.x/10.x. A lockfile-native scanner cannot be retired out from under CI.
- **Anything outside `gates.json` is unguarded.** If a CI job matters, either make it a gate or accept
  that gate 0 will never notice when it rots.

See [[engineering-standards]], [[child-kill-orphans-the-real-server-and-hangs-the-gate]].
