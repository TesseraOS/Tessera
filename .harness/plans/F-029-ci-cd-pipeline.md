# Plan: F-029 CI/CD pipeline (GitHub Actions) running the verification gates

- **Feature:** F-029 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-15 — `docs/PRD.md`
- **Service / package:** root (`.github/workflows/`)
- **Author:** Claude (Opus 4.8) · **Date:** 2026-06-29

## Intent
Run the harness verification gates automatically on every change so "verification is the proof" holds
at scale (ADR-0010), with supply-chain checks. "Done" = the workflow mirrors `gates.json`, adds
dependency audit + secret scanning, and is ready to enforce green CI via branch protection the moment
a remote exists.

## Approach
The `verify` job already mirrors all seven gates (state → typecheck → lint → format → test → build →
e2e) on Node 22.16.0 + pnpm 9 (F-001 + F-011). This feature completes the plan ADR-0010 already set:
- **Secret scanning** — a new `secret-scan` job running `gitleaks/gitleaks-action@v2` over full history
  (`fetch-depth: 0`), with a scoped **`.gitleaks.toml`** allowlist so the scan never trips on
  secret-SHAPED placeholders in tests, examples, docs/plans, or the ingestion redaction detectors —
  while still scanning production source (where a real leaked key would matter).
- **Dependency audit** — the existing `security` job (`pnpm audit --audit-level=high`).
- **Branch protection / activation** — documented in the workflow header: activates on a GitHub remote;
  branch protection should require `verify` + `security` + `secret-scan`.

## Files to touch
- `.github/workflows/ci.yml` — add the `secret-scan` job + branch-protection/activation comments.
- `.gitleaks.toml` — default rules + a scoped allowlist.
- State: `feature_list.json` (→ done), `progress.md`.

## Anticipated effects
- **E-005** (gates.json ⇄ ci.yml ⇄ verification.md) is preserved: the seven **gate steps** still mirror
  `gates.json`; `security` + `secret-scan` are *additional* CI checks (per ADR-0010), not gates.

## Test plan
- The gates already have full unit/integration/e2e coverage; CI runs them. F-029 itself adds infra:
  validate the workflow YAML (prettier parses it) and confirm no production-source file carries a
  secret-format string outside the allowlist (so the scan passes on first run).

## Verification
`state` (the feature's gate) + `format:check` (prettier governs `ci.yml`). The workflow's real run is
on GitHub once a remote is added (none today) — that is its activation, per ADR-0010.

## Risks / open questions
- **gitleaks false positives** on test/redaction fixtures → mitigated by the `.gitleaks.toml` allowlist
  (verified: the only secret-format strings in the repo are in allowlisted tests/plans).
- `gitleaks-action` is free for personal/public repos; a GitHub **org** needs `GITLEAKS_LICENSE`
  (noted in the workflow).
- CD (build/publish/deploy) is out of scope here (R1 image / R2 cloud), per ADR-0010.
