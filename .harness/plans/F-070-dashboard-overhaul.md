# Plan: F-070 Dashboard experience overhaul — 4-theme system, radial propagation, illustration layer + Tess, contrast gate

- **Feature:** F-070 ([`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-49 (UX baseline), NFR-9 (WCAG AA) from [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** `apps/web` (`@tessera/web`)
- **Author:** Claude · **Date:** 2026-07-12
- **Blocked by:** F-066 (done — `@tessera/mascot` ships) · **Effects:** E-004 (rewritten to multi-theme), E-023 (gains apps/web consumers)
- **Selection note:** claimed by explicit stakeholder direction (2026-07-12 dashboard review: "too dull, lifeless, lacks design and creativity … awwwards-grade … add the four themes with a propagating toggle … WCAG AA contrast rule + skill"). **Absorbs F-068** (dashboard mascot adoption — same governance, noted on that entry).

## Intent

Make the dashboard enterprise-grade *and* alive: four coexisting themes (Monkai = current efferd tokens, default; Amber / Claude / Notebook vendored from tweakcn), each light+dark, switched with a radial view-transition ripple from the control; a signature illustration layer + Tess mascot on empty/error/onboarding surfaces under a usage budget; and a real, executable WCAG-AA contrast gate (rule + skill + test). Zero regressions: Monkai default stays visually identical, all gates stay green.

## Ground truths (verified read-only, 2026-07-12)

- **Theming today:** `next-themes` class-based dark mode only ([providers.tsx](../../apps/web/app/providers.tsx), `defaultTheme="dark"`); tokens in [globals.css](../../apps/web/app/globals.css) `:root`/`.dark` (hex values, efferd monochrome); toggle = header dropdown ([theme-toggle.tsx](../../apps/web/components/theme-toggle.tsx)); 3 theme commands in the ⌘K palette.
- **DESIGN-SYSTEM.md §0 makes efferd monochrome BINDING** (ADR-0023) — "no brand hue, no gradients-for-decoration"; deviation requires a superseding ADR → **ADR-0047**.
- **The ripple exists in marketing:** [apps/marketing/lib/theme.tsx](../../apps/marketing/lib/theme.tsx) `useThemeTransition` — `document.startViewTransition(() => flushSync(setTheme))` + clip-path circle animated on `::view-transition-new(root)` from the control's center; instant fallback when the API is missing / reduced-motion / no origin. Port the pattern (no cross-app import; package-boundary lint).
- **Art idiom exists in marketing:** 16 components in `apps/marketing/components/art/` — server-rendered SVG on a fixed grid (e.g. 640×360), HTML chips over SVG edges, tokens-only, CSS-only motion, reduced-motion kill, `aria-hidden`/`role="img"`. Recorded lessons: [[decorative-interactive-canvas-pattern]], [[design-contract-mechanism-outlives-parameters]] (this stakeholder reads austere minimalism as lifeless — F-067 v2 precedent).
- **`@tessera/mascot`** (F-066, ADR-0046): zero-runtime-dep workspace package, `<Mascot mood size interactive/>`, moods idle/curious/working/satisfied/alarmed/celebrating + greeting/lost/searching/watching, closed `--mascot-*` 6-var contract (tile/tile-warm/tile-deep/heart/sheen/ink), CSS-driven motion, reduced-motion = still scene, monochrome `currentColor` fallback when unbound. apps/web does **not** depend on it yet.
- **tweakcn themes fetched (registry JSONs):** amber-minimal (Inter / Source Serif 4 / JetBrains Mono, radius 0.375rem, amber primary), claude (system font stacks, radius 0.5rem, terracotta primary, warm paper canvas), notebook (Architects Daughter / Fira Code, radius 0.625rem, monochrome + yellow accent). Each defines the full shadcn role set + `--shadow-*` scale in oklch, light+dark.
- **e2e today:** 9 Playwright specs (home/search/inspector/graph/memory/timeline/sources/settings/audit) against the production build, incl. axe WCAG A/AA. Web unit tests: RTL + vitest. Marketing enforces design contracts via `tests/design-lint.test.ts` — the model for the executable contrast checker.
- **No `app/not-found.tsx`** in apps/web. Stat cards honestly show "—" until F-060 (no fabricated data — keep it that way).
- **Cards hardcode** `border-none shadow-none dark:ring-0` in several components (dashboard.tsx, stats.tsx, empty-state.tsx…) — blocks per-theme surface expression; must become token-driven with Monkai output unchanged.
- Latest ADR 0046; latest feature F-069; `node scripts/verify-state.mjs` enforces plan-before-code.

## Approach

### W1 — Theme system + contrast gate (foundation)

**Tokens** (`app/globals.css` + new `app/themes.css`):
- Monkai keeps the existing `:root`/`.dark` values **untouched** (default; zero-regression by construction); `[data-theme='monkai']` is an explicit alias.
- Vendor the three tweakcn themes into scoped blocks `[data-theme='amber']` / `[data-theme='amber'].dark` (etc.) — full role set incl. `--chart-*`, `--sidebar-*`, `--radius`, `--shadow-*`, per-theme `--font-sans/serif/mono`. **Not** `shadcn add` (would clobber `:root`/`.dark`; cannot express 4 coexisting themes).
- Extend `@theme inline`: `--shadow-2xs…2xl` + `--font-serif` mappings; Monkai defines a flat/none shadow scale (efferd look preserved).
- Fonts via `next/font/google` with `preload: false` for theme fonts (Inter, Source Serif 4, JetBrains Mono, Architects Daughter, Fira Code); Claude theme = system stacks (zero cost); Geist stays Monkai's face. Same self-hosted pattern as marketing.
- Replace hardcoded surface classes with token-driven treatment (screenshot-compared on Monkai).

**State + propagation** (`apps/web/lib/theme.tsx`):
- Mode stays next-themes (class). **Theme** = `data-theme` on `<html>`, persisted `localStorage('tessera.theme')`, applied by a pre-paint inline script (no FOUC), React context for consumers.
- `useAppearanceTransition({ theme?, mode?, origin })` — ported ripple; one `startViewTransition` wraps both changes; instant under reduced-motion/missing API/rapid toggling.
- **AppearanceSwitcher** replaces the header ThemeToggle (mode segment + theme picker with swatches); mirrored in ⌘K (4 themes + 3 modes) and a /settings Appearance card.

**Contrast Checker:**
- Rule `.harness/rules/frontend/contrast.md`: AA — ≥4.5:1 text pairs, ≥3:1 large text + non-text UI (ring, input borders); token-pair registry; "fix the token, never the check".
- Skill `.harness/skills/contrast-checker/SKILL.md` + `.claude/skills/contrast-checker/` shim; READMEs updated.
- **Executable:** `apps/web/tests/contrast.test.ts` — zero-dep oklch/hex/rgb→sRGB→WCAG-ratio math (unit-tested against known values); parses the theme CSS; asserts the registered pairings across 4 themes × 2 modes inside the standard `test` gate. tweakcn values failing AA get minimally nudged (documented in ADR-0047 + CSS comments); Monkai audited too (e.g. dark `--input` ~1.5:1 non-text → brightened).

### W2 — Illustration layer + mascot (F-068 absorbed)

- New `apps/web/components/art/` in the marketing idiom, **dashboard tokens only**: `constellation-hero` (overview + graph), `compiler-assembly` (inspector idle), `signal-field` (search empty), `memory-strata` (memory), `pipeline-flow` (sources), `ledger-gate` (audit/governance), `time-river` (timeline). Server-rendered SVG, CSS motion + reduced-motion kill, `aria-hidden`, cheap interactivity (hover/pointer) only.
- `EmptyState`/`ErrorState` gain optional `art` + `mascot` slots (backwards-compatible).
- Mascot: `@tessera/mascot` dep + styles import once + `--mascot-*` bound per theme in globals.css. **Budget (DESIGN-SYSTEM v2):** empty (searching/watching), error (alarmed), 404 `app/not-found.tsx` (lost), overview first-run/onboarding (greeting) — never headers/nav/data views; decorative instances `aria-hidden`, text states stay the information carrier.

### W3 — Page-level polish (honest)

- Shell: sidebar active-indicator motion + group treatment + identity chip; header AppearanceSwitcher + refined ⌘K button; consistent page-header pattern (eyebrow/title/description + optional compact art) on all 10 routes.
- Overview: greeting hero band with interactive constellation; restyled stat cards (still "—" until F-060); illustrated Get-started pipeline; Tess watching on the activity empty state.
- Per-page empty/error art adoption + micro-interactions (150–250ms, interruptible, reduced-motion-safe). **No data-layer / table-structure changes** (F-060/061/062/063 own those).

### W4 — Verification + recording

- All gates green: typecheck · lint · format · test (contrast suite + updated RTL) · build · e2e (existing 9 specs + axe).
- New `tests/e2e/appearance.spec.ts`: data-theme set + persists across reload; mode toggle; no-FOUC; reduced-motion instant; axe across 4 themes × 2 modes on representative routes.
- Screenshot matrix (key routes × 4 themes × 2 modes) visually reviewed; Monkai before/after compare.
- Record: progress.md, effects.json (E-004, E-023), F-070 + F-068 → done. Commit per verified increment; never push.

## Increments (each: implement → gates → screenshot-verify → commit)

1. Harness bookkeeping: F-070 registration, this plan, ADR-0047, DESIGN-SYSTEM v2 + manifest, contrast rule + skill + shims.
2. Theme system: themes.css + fonts + data-theme plumbing + contrast test (gate turns on).
3. AppearanceSwitcher + ripple + palette/settings + appearance e2e.
4. Art library + EmptyState/ErrorState slots + mascot binding + 404.
5. Overview hero + per-page adoption + shell/page-header polish.
6. Verification sweep + state/effects/progress recording; F-070 + F-068 → done.

## Risks / guards

- **Monkai must not shift:** exact current values stay as default `:root`/`.dark`; surface-class refactors screenshot-compared before commit.
- **tweakcn AA failures expected:** the contrast gate forces minimal, documented nudges — that is its purpose, not a blocker.
- **View Transitions API** absent (older Firefox/Safari): clean instant fallback (proven in marketing).
- **Font weight:** `preload:false` keeps non-active theme fonts off the critical path; measure first-load JS unchanged.
- **Scope discipline:** no SDK/data changes; stats stay honest; overview live data remains F-060.
