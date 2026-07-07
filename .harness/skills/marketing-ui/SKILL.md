---
name: marketing-ui
description: Build a Tessera marketing-site (apps/marketing) page or section end-to-end — MARKETING-DESIGN.md tokens/archetypes only, static-first, honest content, CSS-only motion, design-lint + axe + screenshot-verified. The public-surface counterpart to build-ui.
---

# Skill: marketing-ui

The orchestration skill for **any** UI work in `apps/marketing`. The dashboard's
[`build-ui`](../build-ui/SKILL.md) does not apply there — marketing pages have their own
binding system and their own failure mode (generic "AI-slop" landing pages), and this skill
exists to make that failure structurally impossible.

> Global loop unchanged: [`add-feature`](../add-feature/SKILL.md) still governs
> plan → implement → verify → trace → record. This skill specializes **implement + verify**
> for marketing pages.

## Authorities (read before writing any JSX)

1. **[`docs/design/BRAND.md`](../../../docs/design/BRAND.md)** + the
   [Terra Mosaic philosophy](../../../docs/design/brand/terra-mosaic-philosophy.md) — the
   brand: palette story, logo system, motion personality, brand metrics.
2. **[`docs/design/MARKETING-DESIGN.md`](../../../docs/design/MARKETING-DESIGN.md)** — binding.
   Direction (§0), the ten non-negotiables (§1), exact tokens for BOTH grounds (§2),
   **section archetypes (§3)** — pages are composed from that inventory only.
3. **[`marketing-design.manifest.json`](../../../docs/design/marketing-design.manifest.json)**
   — the enforced contract; the design-lint gate compiles its patterns.
4. **[ADR-0043](../../../docs/adr/0043-terra-mosaic-brand-and-marketing-overhaul.md)** (direction)
   + **[ADR-0042](../../../docs/adr/0042-marketing-site-design-direction.md)** (mechanism).
5. Rule: [`rules/frontend/marketing.md`](../../rules/frontend/marketing.md) · service manual
   `apps/marketing/AGENTS.md`.

## The loop

1. **Pick archetypes, not layouts.** Map the page's story to §3 archetypes (hero →
   proof-strip → steps → feature-rows → cta-band …). If the story needs a section shape
   that doesn't exist, **stop and extend the doc + manifest first** — never improvise one.
2. **Write the copy before the markup.** §6 voice rules: sentence case, ≤ 8-word headlines,
   concrete mechanisms (compiles, cites, budgets, effect-links), no hype vocabulary, no
   fabricated anything. Copy that fails §6 makes the section fail regardless of styling.
3. **Compose from the closed component set** (§4: Container, Button, TextLink, Badge, Panel,
   CodeBlock, SectionHeading, Wordmark, LogoIcon). Tokens only; the seven named text styles
   only; spacing rhythm from §2.4.
4. **Spend the accent deliberately.** ≤ 2 emerald elements per viewport; primary CTA is
   near-white. If unsure where the accent goes: the one insight you want remembered.
5. **Motion is the thermal system** (§5): micro-interactions on everything touchable,
   in-view reveals that settle once, ≤1 ambient system per viewport, the gilded tile
   arriving once — all through the `lib/motion.tsx` seam (the only framer-motion import),
   reduced-motion = complete stillness, LCP never animated from invisible.
6. **Static-first discipline:** server components; client islands only for the manifest's
   allowed list; no data fetching; no third-party requests; URLs from `NEXT_PUBLIC_*` env.

## Verify (all of it — "renders" ≠ "right")

1. `pnpm --filter @tessera/marketing test` — **design-lint** must be green (it is the taste
   contract; never edit patterns/allowIn just to pass — that's a reviewed design change).
2. Standard gates: typecheck / lint / format / test / build.
3. `pnpm --filter @tessera/marketing test:e2e` — Playwright + **axe WCAG 2.1 AA (zero
   violations)**, one-`h1`, 375px no-overflow, keyboard nav.
4. **Screenshot review** (the step agents skip and must not): 1440×900, 1280×800, 375×812,
   full-page + reduced-motion, against the §8 checklist, ending with the **brand-swap test**
   (cover the logo — if it could be any AI SaaS template, rework).
5. Finish with a [`design-review`](../design-review/SKILL.md) pass — its detectors run on
   top of MARKETING-DESIGN.md for this surface.

## Copy cheat-sheet (what "Tessera voice" sounds like)

- ✅ "Tessera compiles your repos, decisions, and memory into budgeted, cited context
  packages — served to any agent over MCP."
- ❌ "Supercharge your AI workflow with seamless context magic!" (three banned words, an
  exclamation mark, and zero information.)
- ✅ Feature heading: "Context, compiled — not dumped." ❌ "Blazing-fast context retrieval."
- Numbers come from code/docs (PLANS, config limits) or don't appear.
