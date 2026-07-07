# Tessera — Marketing Design System v3 (public surfaces)

| Field | Value |
|-------|-------|
| **Status** | Accepted v3.0 — F-051 ("Terra Mosaic", dual-theme, illustration-first) |
| **Last updated** | 2026-07-07 |
| **Scope** | `apps/marketing` (apex domain). Later: the public chrome of `apps/docs`. |
| **Brand** | [`BRAND.md`](./BRAND.md) + [Terra Mosaic philosophy](./brand/terra-mosaic-philosophy.md) — read both first |
| **Authority** | [ADR-0044](../adr/0044-marketing-v3-dual-themes-illustration-first-live-graph.md) (v3 directives) · [ADR-0043](../adr/0043-terra-mosaic-brand-and-marketing-overhaul.md) (brand) · [ADR-0042](../adr/0042-marketing-site-design-direction.md) (enforcement mechanism) |
| **Enforced by** | design-lint (vitest, compiles [`marketing-design.manifest.json`](./marketing-design.manifest.json)) · axe AA e2e **on both themes** · screenshot review (§8) |

> **Binding for every pixel of the marketing site.** v3 encodes the stakeholder's
> corrected directives: **two themes** (Desert Rose dark / Modern Minimalist light),
> **illustration-first** (terminal and file-system mockups are banned as marketing
> visuals), and a **live interactive knowledge-graph hero**. Awwwards lens throughout
> (design 40 / usability 30 / creativity 20 / content 10). Where this document and the
> dashboard's DESIGN-SYSTEM.md disagree on marketing pages, this wins.

---

## 0. Direction — Terra Mosaic, alive

**"An archivist with a jeweler's hands, working at dusk."** The recurring gesture is the
**tessera** — and in v3 the mosaic *moves*: the hero is a living knowledge graph, every
product truth is told as animated brand art, and the page works in two lights.

- **Two themes, one token architecture:** default **dark = Desert Rose dusk**
  (espresso-plum, ivory, rose/gold embers); **light = Modern Minimalist noon**
  (near-white, charcoal, slate — brand rose/gold in their deep variants). Managed by
  next-themes (`.light` class); **the toggle lives in the footer**. Components are
  tokens-only; `dark:` variants stay banned.
- **Illustration-first (hard rule):** never terminal windows, code blocks, file trees, or
  dashboard chrome as marketing visuals. Product truths become **brand-language art** —
  mosaics assembling, pipelines flowing, graphs breathing, gates deciding.
- **Serif voice** (Instrument Serif, italic emphasis) over a distinctive working grotesque
  (**Manrope**) and a developer-culture mono (**JetBrains Mono**).
- **Still explicitly not:** indigo/neon AI gradients, glassmorphism, particle storms,
  3D blobs, carousels, fabricated social proof, hype vocabulary, UI-chrome cosplay.

## 1. Non-negotiables (the ten)

1. **Tokens only** (§2) — no raw palette classes, no arbitrary brackets, no hex in
   components; both themes come from the same semantic tokens. Gate-enforced.
2. **Accent budget per theme:** rose ≤3 elements per viewport; **gold ≤1 moment per
   band**; focus rings free.
3. **Sanctioned decoration only:** the tokenized gradients (`--gradient-ember`,
   `--gradient-dusk`), `.text-ember`, `.grain`, the `.hero-scrim`, and `shadow-soft/lift`
   (light-ground cards) — all declared once per theme in `globals.css`.
4. **Hero H1 is server-rendered and immediately visible.** The live graph loads behind it
   (`ssr:false`); LCP is never animated from invisible; no typing effects.
5. **Honest content only.** No invented logos/testimonials/metrics; simulated telemetry
   is **visibly labeled "demo"**; product visuals mirror real mechanics; pricing from
   `@tessera/billing` PLANS; integrations as typographic wordmarks.
6. **Sentence case; serif never bold; no emoji; no exclamation marks.** Mono labels may
   be uppercase.
7. **One `h1`; heading levels never skip; every section landmark labelled.** Interactive
   art is `aria-hidden` + keyboard-inert with a text alternative.
8. **Motion = the thermal system (§5)**, framer-motion only via `lib/motion.tsx`;
   reduced-motion ⇒ complete stillness (graph static, telemetry frozen); no scroll
   hijacking (`zoomOnScroll` off on canvases); no `transition-all`.
9. **Static-first, zero client data fetching, zero third-party requests.** Telemetry is
   client-side simulation, never a network call.
10. **Screenshot-verified on BOTH themes** (§8): 1440/1280/375, full-page, reduced-motion
    — plus the brand-swap test.

## 2. Tokens (exact values — `app/globals.css` is the single source)

### 2.1 Dark — Desert Rose dusk (`:root`, default)

| Token | Value | | Token | Value |
|-------|-------|-|-------|-------|
| `--background` | `#161013` | | `--rose` / fg | `#e2a3a8` / `#2b1218` |
| `--surface` | `#1e1519` | | `--gold` | `#e4b65a` |
| `--card` / fg | `#251a20` / `#f4ede7` | | `--clay` | `#c8836c` |
| `--foreground` | `#f4ede7` | | `--burgundy` | `#5d2e46` |
| `--muted-foreground` | `#b7a8a8` | | `--border` / strong | `rgba(244,237,231,.10)` / `.18` |
| `--faint-foreground` | `#968690` | | `--input` | `rgba(244,237,231,.14)` |
| `--primary` / fg | `#f4ede7` / `#261720` | | `--ring` | `#e2a3a8` |
| `--secondary` / fg | `#2a1e24` / `#f4ede7` | | `--code` | `#120d10` |

Sand chapter (`[data-band='sand']`): as v2 (sand `#f1e8df`, espresso text, deep accents,
`shadow-soft` cards).

### 2.2 Light — Modern Minimalist noon (`.light`)

| Token | Value | | Token | Value |
|-------|-------|-|-------|-------|
| `--background` | `#fbfbfc` | | `--rose` / fg | `#9e4a56` / `#fbf3ee` |
| `--surface` | `#f2f4f6` | | `--gold` | `#8a6a24` |
| `--card` / fg | `#ffffff` / `#2a353f` | | `--clay` | `#a05f45` |
| `--foreground` | `#2a353f` | | `--burgundy` | `#5d2e46` |
| `--muted-foreground` | `#55636f` | | `--border` / strong | `rgba(42,53,63,.12)` / `.22` |
| `--faint-foreground` | `#6e7c88` | | `--input` | `rgba(42,53,63,.16)` |
| `--primary` / fg | `#2a353f` / `#ffffff` | | `--ring` | `#9e4a56` |
| `--secondary` / fg | `#e9ecef` / `#2a353f` | | `--code` | `#120d10` (unchanged) |

Light sand chapter (`.light [data-band='sand']`): `--background #f2f4f6`, `--card #ffffff`
— the chapter reads as a soft slate band. Light gradients re-declare in deep variants;
`shadow-soft/lift` apply on the base light ground too (cards float on paper).

### 2.3 Sanctioned decoration & chrome

- Gradients: `--gradient-ember` (rose→gold; deep variants in light), `--gradient-dusk`
  (atmosphere ≤18% alpha), `.text-ember`, `.hero-scrim` (text-legibility veil over the
  live graph). Declared once per theme in globals; OG/icon renderers reproduce by value.
- `.grain` texture ≤3%; **branded scrollbar** (clay/rose thumb, WebKit +
  `scrollbar-color`) — part of the brand surface.
- Shadows `soft/lift`: light-ground cards (sand chapter in dark; base + chapter in light).

### 2.4 Typography (closed scale — same seven names)

Families: `--font-serif` **Instrument Serif** (400 + italic) · `--font-sans` **Manrope**
(variable — the distinctive working face) · `--font-mono` **JetBrains Mono**. All
next/font self-hosted. Scale values unchanged from v2 (display/title serif via base
layer; heading/lead/body/small sans; label mono). Serif emphasis = *italic*, never bold.

### 2.5 Layout & rhythm

Container `max-w-6xl px-6 md:px-8`; section `py-24 md:py-32`; hero `min-h-svh` with the
graph full-bleed; ≥45% quiet ground per band; 12-col asymmetric rows; spacing steps
{1,2,3,4,5,6,8,10,12,16,20,24,32,36,44}. Whitespace is compositional — no double-gapped
seams, no cramped stacks (screenshot checklist enforces).

## 3. Section archetypes (v3)

1. **`nav`** — **transparent at top** (no bg, no hairline); after ~8px scroll gains
   dusk-glass (`bg-background/85` + blur, the only blur) + hairline. Draw-in underline
   links; primary CTA sm. **Mobile: full-screen overlay menu** — serif links staggering
   in, body scroll-locked, Escape + close button, focus moved in.
2. **`hero`** — full-bleed **live knowledge graph** (`@xyflow/react`): token-themed
   draggable nodes (sources → tessera hub → agents), animated bezier edges with rotating
   rose pulses, **simulated telemetry** ticking (requests/min, tokens served, agents —
   labeled `demo`). `zoomOnScroll` off; keyboard-inert + `aria-hidden` with text
   alternative; reduced-motion = static. Over it: `.hero-scrim`, then eyebrow → serif
   `display` h1 (left-aligned; one rose *italic*) → lead → CTA row.
3. **`marquee-strip`** — as v2 (hover-paused wordmarks, honest names).
4. **`problem-band`** — the "why" (sand chapter): serif statement + three pain
   illustrations (fading tiles / the context dump / the severed link), Reveal-staggered.
5. **`steps`** — three cards + the **pipeline illustration** (sources → mark → agents,
   flowing dashes) replacing any code block.
6. **`feature-row`** — text(5)/art(7) alternating; visuals are **brand-language
   illustrations** (assembly scene + token meter; mini effect-web on the graph engine;
   governance gate) — never UI chrome.
7. **`pricing-table`** / **`faq`** — as v2.
8. **`cta-band`** — dusk atmosphere + quiet MosaicField + serif statement + primary CTA.
9. **`footer`** — columns, lockup, philosophy line, legal — **and the theme toggle**
   (labelled control, aria-pressed states).

**Banned archetypes:** terminal windows, code-block panels, file trees, fake dashboards,
browser-chrome screenshots.

## 4. Components (closed set)

`Container` · `Button` · `TextLink` · `Badge` · `Panel` · `SectionHeading` · `Wordmark` ·
`Logo/LogoIcon` · `MosaicField` · **`LiveGraph`** (hero; React Flow) · **`EffectWeb`**
(mini React Flow) · **`PipelineFlow`** · **`CompilerAssembly`** · **`GovernanceGate`** ·
**`ProblemBand` illustrations** · **`ThemeToggle`** (footer) · `Reveal` / `Marquee` /
motion seam `lib/motion.tsx` (the only framer-motion import). React Flow imports live
only in `components/art/*`.

## 5. Motion — thermal system + the living graph

v2 rules stand (micro 150–250ms; reveals settle once; ≤1 ambient system per viewport;
gilded tile arrives once; reduced-motion = stillness). Additions:

| Layer | Spec |
|-------|------|
| Live graph | edges `animated` (marching dash); one rose pulse rotates every ~1.6s; telemetry ticks every 1.2–2s with small deltas; drag = spring settle |
| Canvas rules | `zoomOnScroll:false`, `preventScrolling:false` (page scroll always wins), `nodesFocusable:false` + keyboard-a11y disabled (decorative-interactive) |
| Illustration loops | flowing dashes are that band's ambient system; assembly/gate scenes play once in view |
| Reduced motion | graph renders final layout, no dash animation, telemetry frozen at seed values |

## 6. Voice & content — unchanged

Concrete mechanisms, sentence case, no hype (gate list), nothing fabricated, simulated
data labeled `demo`, CTAs are verbs, URLs from `NEXT_PUBLIC_*`.

## 7. Accessibility, SEO, performance

- **WCAG 2.1 AA on both themes** (axe e2e toggles `.light` and re-scans). All §2 pairs
  pre-verified. Landmarks, one h1, visible `--ring`, full keyboard paths (incl. the
  full-screen menu), no 375px overflow. Interactive art: `aria-hidden`, zero focusables
  inside, sibling text alternative.
- **SEO:** unchanged baseline (metadata, OG from brand fonts, sitemap/robots/llms.txt).
- **Performance:** first-load JS ≤240KB gz (graph chunk is lazy `ssr:false`); LCP <2.0s
  (H1 text, not the canvas); CLS <0.05 (graph container has reserved height); INP <200ms.
  Lighthouse CWV gate lands with F-049.

## 8. Review protocol

design-lint green → gates + axe **(dark + light)** → screenshots (1440/1280/375 ×
dark/light × reduced-motion) against: one primary action per viewport · accent budgets ·
the arc reads in both themes · serif voice present · **no UI-chrome mockups anywhere** ·
graph aligned/contained (zero overflow) · whitespace rhythm consistent · honest labels
(`demo`) · mobile menu + toggle usable · brand-swap test. Then the
[`design-review`](../../.harness/skills/design-review/SKILL.md) audit.

## 9. References

BRAND.md · terra-mosaic-philosophy.md · ADR-0042/0043/0044 · theme-factory (Desert Rose,
Modern Minimalist) · @xyflow/react (dashboard precedent F-043) · Awwwards evaluation
research · manifest: marketing-design.manifest.json (v3).
