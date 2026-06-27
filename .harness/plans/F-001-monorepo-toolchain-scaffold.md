# Plan: F-001 — Monorepo & toolchain scaffold (the enforceable code harness)

- **Feature:** F-001 ([`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-8, NFR-10, NFR-15 · **ADRs:** 0001, 0002, 0005, 0010
- **Service / package:** root
- **Author:** Claude · **Date:** 2026-06-27 · **Status:** ready (first coding feature)

## Why this is the "code harness"
The rules/skills/protocols **govern** how code is written; this feature materializes the
**enforceable** part — the config files that make the gates real. They must live with the
toolchain, so they're created here (not invented abstractly). After F-001, the
`pending-toolchain` gates in [`../verification/gates.json`](../verification/gates.json) flip
to `active`.

## Intent
A green, empty Turborepo + pnpm workspace where `pnpm -w typecheck|lint|format:check|test|build`
all pass, package boundaries are enforced, and CI runs the same gates.

## Scope (what the scaffold materializes)
- **Workspace:** `pnpm-workspace.yaml` (`apps/*`, `packages/*`), root `package.json`
  (engines: node 22, pnpm ≥ 9; scripts mapping 1:1 to gates), `turbo.json` pipeline
  (`build`, `lint`, `typecheck`, `test`, `format:check` with correct `dependsOn`/caching).
- **TypeScript (strict):** base `tsconfig` with `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`; ESM; project
  references. Per-package `tsconfig` extends base.
- **Lint/format:** ESLint (type-aware, flat config) + Prettier. **Package-boundary rule**
  (e.g. `eslint-plugin-boundaries` or `import/no-restricted-paths`) enforcing ADR-0001 (no
  deep cross-package imports; `@tessera/core` importable by all, depends on none).
- **Tests:** Vitest config (unit + integration projects); coverage thresholds; a
  **conformance-suite harness pattern** stub for ports (ADR-0003).
- **CI:** `.github/workflows/ci.yml` running `verify-state` + the gates on Node 22/pnpm
  (ADR-0010); dependency audit + secret scan. Activates when a remote exists.
- **Hygiene:** `.env.example` (placeholders only), root `README` dev section already present.
- **No domain code** — empty `packages/`/`apps/` placeholders only (or a trivial
  `@tessera/core` shell deferred to F-002).

## Files to touch (representative)
`pnpm-workspace.yaml`, `package.json`, `turbo.json`, `tsconfig.base.json`,
`eslint.config.mjs`, `.prettierrc`, `vitest.config.ts`, `.github/workflows/ci.yml`,
`.env.example`.

## Anticipated effects
- Flipping gate status in [`../verification/gates.json`](../verification/gates.json) from
  `pending-toolchain` → `active` (update the file as part of this feature).
- CI workflow must mirror `gates.json` (keep them in lockstep — record as an effect-link).

## Test plan
- `pnpm install` clean; each gate command runs and passes on the empty scaffold.
- A deliberate boundary violation fails lint (proves the boundary rule works).

## Verification
`node scripts/verify-state.mjs` → `pnpm -w typecheck` → `lint` → `format:check` → `test`
→ `build`, all green, evidence in [`../state/progress.md`](../state/progress.md).

## Risks / open questions
- Keep config minimal-but-correct; resist adding tooling not yet needed.
- Auth library (OIDC) and graph-storage (OQ2) are **not** part of F-001.
