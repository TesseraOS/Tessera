# Plan: F-051 Marketing site (apps/marketing) on the apex domain

- **Feature:** F-051 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-67, NFR-17 (from [`../../docs/PRD.md`](../../docs/PRD.md)); ADR-0035, ADR-0036
- **Service / package:** `apps/marketing`, `@tessera/marketing`
- **Author:** Claude (Fable 5) session · **Date:** 2026-07-07

## Intent

Tessera's first impression: a static-first, SEO-clean marketing site on the apex domain that
positions the product (Context & Memory OS for AI coding agents) and sells the three
differentiators — Context Compiler, effect-links, governance — beyond the unabyss.com
reference. Done = pages live (home, features, pricing from the PLANS catalog, enterprise/trust,
/skills placeholder), CWV + SEO baseline, axe AA green, screenshot-verified visual quality.

**This feature also hardens the frontend harness for public surfaces.** The dashboard design
system (efferd Dashboard 3) is app-shell-scoped and under-constrains marketing pages — the gap
where generated UI degrades into "AI slop." Before any marketing code, we land a **binding
marketing design system + deterministic gate-level enforcement**, so any future agent working
on `apps/marketing` is constrained into the intended visual quality.

## Design direction (locked by ADR-0042 in increment 1)

- **Dark-only v1**, near-black canvas (`#050505` family), hairline borders, flat surfaces
  (no drop shadows). Typography-led: Geist Sans tight-tracked display scale + Geist Mono for
  technical labels/code. Sentence-case headings.
- **Monochrome + one accent (emerald)**, used at most twice per viewport (primary CTA +
  one highlight). No gradient text, no glassmorphism-as-decoration, no indigo/violet AI-slop
  palette. Brand-coherent: emerald is already the dashboard's single functional accent.
- **Signature visual: the tessera mosaic** — scattered context fragments assembling into a
  compiled Context Package (the logo's own narrative, product-true). Pure CSS/SVG; no stock
  3D, no canvas/WebGL.
- **Motion:** CSS-only in v1 (no framer-motion dependency); short ease-out entrances on
  secondary elements only; hero H1/LCP renders visible immediately; everything
  `prefers-reduced-motion`-safe; no scroll-jacking, no parallax, no page-level opacity fades.
- **Honesty (hard rule):** no fabricated logos, testimonials, ratings, user counts, or
  invented metrics. Integration names as typographic wordmarks (real MCP clients). Pricing
  numbers only from `@tessera/billing` PLANS. Claims trace to PRD/architecture.

## Approach — increments

0. **Claim + plan** (this document). `feature_list.json` → `in_progress`.
1. **Marketing design harness** (docs + rules + skill, no app code):
   - `docs/design/MARKETING-DESIGN.md` — binding design system for public surfaces:
     direction, exact tokens, fluid type scale, section rhythm/container, component & section
     inventory, copy/voice rules, banned patterns, motion rules, SEO/OG rules, a11y.
   - `docs/design/marketing-design.manifest.json` — machine-readable projection.
   - `docs/adr/0042-marketing-site-design-direction.md` — locks the direction; scopes
     dark-only + emerald accent as a deliberate deviation from the dashboard doc.
   - `.harness/rules/frontend/marketing.md` — service rule binding `apps/marketing` to the
     doc; static-first constraints (no authenticated API calls, no credentials — NFR-17).
   - `.harness/skills/marketing-ui/SKILL.md` (+ `.claude/skills/` shim + README indexes) —
     the build-ui counterpart for marketing pages.
   - Pointers updated: DESIGN-SYSTEM.md (scope note), ADR index, skills README.
2. **Scaffold `apps/marketing`** (@tessera/marketing, Next.js App Router, static-first):
   - Tokens-only `globals.css` (marketing token set), fonts, root layout, minimal `ui/`
     primitives (button, container) composed per the shadcn pattern (cva) — no dashboard
     imports (package-boundary rule stays intact).
   - SEO baseline: per-page `metadata`, `sitemap.ts`, `robots.ts`, OG image, `llms.txt`
     (ADR-0036).
   - **Deterministic design-lint** (vitest): scans marketing source; fails on banned
     patterns (gradient text, raw palette classes, arbitrary hex/rgb, shadows, emoji,
     hype words…). This is the "strict harness" teeth.
   - Playwright e2e project + axe AA; joins turbo typecheck/lint/test/build/e2e + CI.
3. **Homepage** (hero is the showpiece): nav, hero + mosaic-assembly visual, MCP-clients
   proof strip (typographic), how-it-works (3 steps + real `mcp-config` snippet),
   differentiators (3 asymmetric feature rows: compiler / effect-links / governance),
   deploy-anywhere band, CTA band, footer. CTAs → app subdomain via `NEXT_PUBLIC_APP_URL`.
4. **Later sessions (same feature):** features page, pricing (from PLANS catalog),
   enterprise/trust, /skills placeholder, OG-image polish, `web-perf` wiring (budget lands
   with F-049 per gates.json but the app must stay within NFR-17 budgets from day one).

## Files to touch

- `.harness/state/feature_list.json` — F-051 → `in_progress` (inc 0), `done` at the end.
- `docs/design/MARKETING-DESIGN.md`, `docs/design/marketing-design.manifest.json` — new.
- `docs/adr/0042-marketing-site-design-direction.md`, `docs/adr/README.md` — new + index.
- `.harness/rules/frontend/marketing.md`, `.harness/rules/README.md` — new + index.
- `.harness/skills/marketing-ui/SKILL.md`, `.harness/skills/README.md`,
  `.claude/skills/marketing-ui/SKILL.md` — new + indexes.
- `docs/design/DESIGN-SYSTEM.md` — scope note pointing marketing at the new doc.
- `apps/marketing/**` — new app (AGENTS.md, app/, components/, tests/, configs).
- Root: `pnpm-workspace.yaml` (if apps/* not already globbed), CI workflow (Playwright
  install matrix if per-app), `.env.example` (NEXT_PUBLIC_APP_URL etc.).
- `.harness/state/effects.json` — new effect-link: marketing tokens/design doc → marketing
  components (mirrors E-004); record E-004 consultation.

## Anticipated effects

- **E-004 (design tokens → all components):** marketing gets its *own* token values with the
  same semantic structure; dashboard tokens untouched. New effect-link added for the
  marketing token set.
- **Workspace pipelines:** new app joins turbo tasks — risk of breaking `pnpm -w`
  typecheck/lint/build/e2e if misconfigured; mitigated by mirroring `apps/web` config.
- **`@tessera/billing` PLANS:** pricing page (later increment) renders from the catalog —
  adds a dependent on that contract (will be recorded when the pricing page lands).
- No API/MCP surface changes. No changes to existing apps.

## Test plan

- **Unit (vitest):** design-lint scanner (the enforcement test itself + its fixtures);
  component smoke tests where logic exists (e.g. nav toggle).
- **E2E (Playwright, static build):** axe WCAG 2.1 AA on every page; exactly one `h1`;
  heading-order sanity; no horizontal overflow at 375px; CTAs resolve to configured app URL;
  `sitemap.xml`, `robots.txt`, `llms.txt` respond 200; nav keyboard path.
- **Visual:** preview screenshots (desktop 1280, mobile 375, dark) reviewed against
  MARKETING-DESIGN.md + design-review skill before "done".

## Verification

`state` → `typecheck` → `lint` → `format` → `test` → `build` → `e2e` (all currently-active
gates), evidence captured per [verification protocol](../protocols/verification.md).
`web-perf` is planned (activates F-049) — we still keep the initial JS payload lean
(static-first, no client data fetching, CSS-only motion) and record bundle output as evidence.

## Risks / open questions

- **TLD not final** (`tessera.<tld>`): all cross-surface URLs env-driven
  (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DOCS_URL`) with placeholder defaults; sitemap/OG read
  `NEXT_PUBLIC_SITE_URL`. No hardcoded domains.
- **Dark-only** deviates from the dashboard's light/dark/system rule — scoped to the
  marketing surface and recorded in ADR-0042 (revisit post-launch if demanded).
- **Third-party wordmarks:** we use plain-text names (no logo assets) to avoid brand-asset
  licensing issues at this stage.
- **Design-lint false positives** (e.g. legitimate `shadow-none`): the scanner allow-lists
  explicitly; fixtures cover both directions.
