# Tessera — Docs Design System v1 (documentation surface)

| Field | Value |
|-------|-------|
| **Status** | Accepted v1.0 — F-053 (docs site foundation) |
| **Last updated** | 2026-07-20 |
| **Scope** | `apps/docs` (docs subdomain — ADR-0035). |
| **Brand** | [`BRAND.md`](./BRAND.md) + [Terra Mosaic philosophy](./brand/terra-mosaic-philosophy.md) — read both first |
| **Authority** | [ADR-0054](../adr/0054-docs-surface-terra-mosaic-reading-chrome-and-generated-reference.md) (this surface) · [ADR-0046](../adr/0046-brand-mascot-tess.md) (mascot) · [ADR-0044](../adr/0044-marketing-v3-dual-themes-illustration-first-live-graph.md)/[0045](../adr/0045-marketing-v4-constellation-shader-hero-theme-true-chapters.md) (dual themes, ripple, art idiom) · [ADR-0035](../adr/0035-public-web-platform-three-surfaces.md) (Fumadocs) |
| **Enforced by** | design-lint (vitest, compiles [`docs-design.manifest.json`](./docs-design.manifest.json)) · axe AA e2e **on both themes** · screenshot review (§7) |

> **Binding for every pixel of the docs site.** The docs are the **Terra Mosaic reading
> surface**: the marketing brand's dual themes and warmth, tuned for hours of reading and
> code. Where marketing performs, the docs serve — restraint first, but never lifeless
> (the recorded lesson stands: this brand reads austerity as lifelessness). Where this
> document and MARKETING-DESIGN.md disagree **on docs pages**, this wins; token *values*
> always come from MARKETING-DESIGN §2 (one public-surface palette, two readings).

---

## 0. Direction — the archivist's reading room

Marketing is the gallery; the docs are the **reading room of the same building**. Same
dusk/noon light, same serif voice for statements, same gilded restraint — applied to a
surface whose job is orientation, comprehension, and trust. The distinctive moves:

- **Two themes, one token architecture:** default **dark = Desert Rose dusk**, **light =
  Modern Minimalist noon** — the exact §2 values from MARKETING-DESIGN. Managed by
  next-themes (`class` attribute; fumadocs' `.dark` convention + `.light` both present).
  Theme changes **propagate radially from the pressed control** (ADR-0054 §ripple).
- **The mono voice returns.** Marketing retired mono (v4.1) because captions posed as
  code; here **code is content** — Geist Mono speaks in code blocks, keys, paths, and
  identifiers. Three faces total: Instrument Serif (statements), Manrope (prose/UI),
  Geist Mono (code).
- **Stock Fumadocs, our light.** Fumadocs components are never forked; the entire brand
  enters through the `--color-fd-*` binding seam in `globals.css` (§2). Framework
  upgrades must never involve design surgery.
- **Rose is the interactive voice** — links, active nav, active TOC, search highlight.
  Like focus rings, interactive rose is *functional* and exempt from the decorative
  accent budget. Gold stays the rarest thing on the page (≤1 decorative moment per
  viewport: the mascot's heart, or one `.text-ember` statement — never both).

## 1. Non-negotiables (the eight)

1. **Tokens only** — no raw palette classes, no arbitrary color brackets, no hex in
   components; both themes come from the same semantic tokens. Gate-enforced.
2. **The fd seam is the only Fumadocs customization channel.** No component forks, no
   `!important` overrides of fumadocs internals; layout knobs (`--fd-layout-width`) and
   the documented slot props (`themeSwitch`, nav) are the sanctioned surface.
3. **Theme state lives in `lib/theme.tsx` alone** (the seam file): it is the only module
   that may touch the next-themes context (via `fumadocs-ui/provider/base`), and every
   theme change goes through `useThemeTransition` (radial ripple, reduced-motion-safe).
4. **Honest content only.** Facts render from `generated/` (OpenAPI, MCP tools, CLI,
   agent configs, env vars — drift-gated); nothing aspirational presented as shipped;
   unshipped paths are labeled (npm install → F-059, cloud deploy → F-056). No invented
   metrics, no placeholder screenshots posing as product.
5. **Motion is CSS-only** (transform/opacity, the house easing), interruptible, and
   **reduced-motion ⇒ complete stillness** (ambient art frozen, ripple skipped —
   fumadocs' own micro-transitions are within budget). No framer-motion on this app; no
   scroll hijacking; no `transition-all`.
6. **Sentence case; serif never bold; no emoji in UI chrome; no exclamation marks.**
   H1/H2 are the serif voice; prose stays Manrope; identifiers stay mono.
7. **One `h1` per page; heading levels never skip; landmarks labelled.** Decorative art
   is `aria-hidden` with the information always in text; interactive controls are real
   buttons with labels. WCAG 2.1 AA on **both themes** (axe e2e).
8. **Static-first, zero third-party requests, no credentials** (NFR-17). Search is the
   local Orama index; fonts are self-hosted by next/font; the only localStorage entry is
   the theme choice.

## 2. Tokens & the Fumadocs seam

Token **values** are MARKETING-DESIGN §2 (dusk `:root` / noon `.light`), declared once in
`apps/docs/app/globals.css` — the single source for this app. On top, the docs add:

- **The fd binding** (`@theme inline`): every `--color-fd-*` role → a Terra Mosaic
  token. Key mappings: `fd-primary ← --rose` (+ `fd-primary-foreground ← --rose-foreground`),
  `fd-muted ← --surface`, `fd-popover/fd-card ← --card`, `fd-accent ← --secondary`,
  `fd-ring ← --ring`, `fd-error ← --error`.
- **Functional semantics stay semantic:** callout/diff colors (`fd-info/warning/
  success/idea/diff-*`) are vendored Fumadocs defaults, not brand hues (the dashboard's
  emerald/red rule applied here). They live only in the globals binding block.
- **New tokens** (docs-only): `--error` and `--overlay` per theme.
- **Faces:** `--font-sans` Manrope · `--font-serif` Instrument Serif · `--font-mono`
  Geist Mono (all next/font, zero runtime requests).
- **Sanctioned decoration** (defined once in globals, consumed as classes):
  `.text-ember`, `.atmosphere`, `.grain`, `shadow-soft/lift` (light-ground cards),
  the branded scrollbar, `::selection` in rose.

## 3. Layout & chrome

- **Stock Fumadocs layouts** (Home + Docs), tree-driven sidebar, breadcrumbs, TOC,
  built-in search dialog. Nav title is the `@tessera/brand` lockup (never a hand-drawn
  copy). Cross-surface links (Website, Dashboard) come from `lib/site.ts` — **no
  hardcoded domains** anywhere.
- **The theme toggle** replaces fumadocs' stock switch through the `themeSwitch` slot in
  `app/layout.config.tsx` — one component, every placement (nav + sidebar footer). An
  explicit choice pins the theme; before that, system preference decides.
- Content pages are composed from MDX + stock fumadocs-ui MDX components (Callout,
  Tabs, Steps, Cards, CodeBlock). Custom components live in `components/` and are
  tokens-only.

## 4. Motion

- **The ripple** (`useThemeTransition`): `startViewTransition` + a clip-path circle
  growing from the pressed control, 550ms, house easing; instant fallback when the API
  is missing, no origin is known, or the visitor prefers reduced motion. The default VT
  crossfade is disabled in globals.
- **Ambient art** runs infinite CSS loops (breath/drift/glow — thermal rates, never
  bounce/spin), transform/opacity only, `transform-box: fill-box`, and freezes entirely
  under `prefers-reduced-motion`.
- **Micro-interactions** (hover lift, copy feedback, active-TOC glow) are ≤200ms
  transitions on specific properties — `transition-all` is banned.

## 5. Art & mascot budget

The marketing art idiom under docs tokens: server-rendered token-driven SVG, CSS-only
motion, honest (art never fabricates data), `aria-hidden` + text sibling.

**Sanctioned placements — and no others:** the docs-home hero band, docs-home section
cards, the 404 (Tess `lost`), the search empty state (Tess `searching`), and the
docs-home greeting spot (Tess, one instance). Never inside content prose, reference
tables, or code blocks. Where Tess appears, its gilded heart **is** that viewport's gold
moment (ADR-0046 budget). Mascot imports are design-lint-scoped to the sanctioned files.

## 6. Content voice

- **Verbose on purpose, accurate by construction.** Explain the why, the how, and the
  edge cases; every fact that has a machine source renders from `generated/` — prose
  never restates a number/name/flag that generation covers (drift-gated).
- Sentence case headings; direct address ("you"); present tense; no hype vocabulary
  (revolutionary, blazing, seamless…), no marketing superlatives in docs prose.
- Every page has `title` + `description` frontmatter (feeds search, SEO, llms.txt).
- Code samples must be runnable as shown against the documented version, or explicitly
  marked otherwise.

## 7. Review protocol (definition of done for a docs screen)

1. design-lint green (compiles [`docs-design.manifest.json`](./docs-design.manifest.json)).
2. axe WCAG 2.1 AA e2e green **on both themes**.
3. Screenshot review at 1440 / 1280 / 375, both themes, plus reduced-motion — checked
   against §0–§6.
4. Contrast: body text ≥ 4.5:1, large text/non-text UI ≥ 3:1 on both themes (the token
   values inherit marketing's audited pairs; new pairings must be checked).
5. Workspace gates green (`typecheck`/`lint`/`test`/`build`/`e2e`).

If design-lint fails: **fix the code, never the pattern.** Pattern/allowIn edits are
design decisions — update this document and the manifest together, with review.
