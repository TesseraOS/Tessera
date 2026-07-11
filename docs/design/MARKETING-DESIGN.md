# Tessera — Marketing Design System v4 (public surfaces)

| Field | Value |
|-------|-------|
| **Status** | Accepted v4.8 — F-066 v3 (Tess acts: hands + per-mood activity loops + props, sheen removed; v4.7 face/reactions, v4.6 introduced the mascot) |
| **Last updated** | 2026-07-11 |
| **Scope** | `apps/marketing` (apex domain). Later: the public chrome of `apps/docs`. |
| **Brand** | [`BRAND.md`](./BRAND.md) + [Terra Mosaic philosophy](./brand/terra-mosaic-philosophy.md) — read both first |
| **Authority** | [ADR-0046](../adr/0046-brand-mascot-tess.md) (mascot) · [ADR-0045](../adr/0045-marketing-v4-constellation-shader-hero-theme-true-chapters.md) (v4 directives) · [ADR-0044](../adr/0044-marketing-v3-dual-themes-illustration-first-live-graph.md) (dual themes / illustration-first) · [ADR-0043](../adr/0043-terra-mosaic-brand-and-marketing-overhaul.md) (brand) · [ADR-0042](../adr/0042-marketing-site-design-direction.md) (enforcement mechanism) |
| **Enforced by** | design-lint (vitest, compiles [`marketing-design.manifest.json`](./marketing-design.manifest.json)) · axe AA e2e **on both themes** · screenshot review (§8) |

> **Binding for every pixel of the marketing site.** v4 encodes the stakeholder's fourth
> review: the hero is a **serif statement over a WebGL shader field** behind a legibility
> veil; the knowledge graph moves **south of the hero** as a full-bleed **canvas
> constellation** — deep, nested, with heavy randomized packet traffic and click-to-toggle
> nodes, pseudo-3D (drawn, never a 3D engine); chapter bands are **theme-true** (dark mode
> stays dark). v3's dual themes and illustration-first rules stand. Awwwards lens
> throughout (design 40 / usability 30 / creativity 20 / content 10). Where this document
> and the dashboard's DESIGN-SYSTEM.md disagree on marketing pages, this wins.

---

## 0. Direction — Terra Mosaic, alive

**"An archivist with a jeweler's hands, working at dusk."** The recurring gesture is the
**tessera** — and in v4 the mosaic *breathes in depth*: a shader field flows behind the
serif statement, and one scroll below, the product's knowledge graph hangs as a
constellation with real traffic moving through it. Every product truth is told as animated
brand art, and the page works in two lights.

- **Two themes, one token architecture:** default **dark = Desert Rose dusk**
  (espresso-plum, ivory, rose/gold embers); **light = Modern Minimalist noon**
  (near-white, charcoal, slate — brand rose/gold in their deep variants). Managed by
  next-themes (`.light` class); **the toggle lives in the footer**. Components are
  tokens-only; `dark:` variants stay banned. **Dark mode is dark end-to-end** — chapter
  bands elevate, they never invert to a light ground (ADR-0045).
- **Illustration-first (hard rule):** never terminal windows, code blocks, file trees, or
  dashboard chrome as marketing visuals. Product truths become **brand-language art** —
  mosaics assembling, pipelines flowing, graphs breathing, gates deciding.
- **Depth is drawn, never simulated:** the constellation is pseudo-3D (projection, fog,
  parallax) on Canvas-2D; the field is one fragment shader. `three`/`@react-three` are
  banned imports (gate-enforced).
- **Serif voice** (Instrument Serif, italic emphasis) over a distinctive working grotesque
  (**Manrope**). **The mono voice is retired site-wide (v4.1)** — labels/eyebrows are
  tracked Manrope, and captions never render as SVG text.
- **Still explicitly not:** indigo/neon AI gradients, glassmorphism, particle storms,
  3D blobs, carousels, fabricated social proof, hype vocabulary, UI-chrome cosplay.

## 1. Non-negotiables (the ten)

1. **Tokens only** (§2) — no raw palette classes, no arbitrary brackets, no hex in
   components; both themes come from the same semantic tokens. Gate-enforced.
2. **Accent budget per theme:** rose ≤3 elements per viewport; **gold ≤1 moment per
   band**; focus rings free.
3. **Sanctioned decoration only:** the tokenized gradients (`--gradient-ember`,
   `--gradient-dusk`), `.text-ember`, `.grain`, the `.hero-veil` (scrim + masked backdrop
   blur — with the nav glass, the only two blur devices), the **shader field** (one WebGL
   fragment shader, `components/art/shader-field.tsx`), and `shadow-soft/lift`
   (light-ground cards) — all declared once per theme in `globals.css` / the art component.
4. **Hero H1 is server-rendered, immediately visible, and exactly two lines.** Each line
   is a nowrap span; the display clamp is tuned so the pair holds 375→1440 (screenshot
   gate). The shader field loads behind it (`ssr:false`, `.atmosphere` fallback); LCP is
   never animated from invisible; no typing effects.
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

Chapter band (`[data-band='chapter']`, dark theme): an **elevated warm-dark interlude** —
ground `#1d1418`, surface `#241a1f`, card `#2b1f26`, ivory text, hairline seams (shadows
read as flat here; cards rely on lifted ground + `border-strong`). The v2 light-sand
chapter is retired in dark mode (ADR-0045): dark stays dark.

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

Light chapter (`.light [data-band='chapter']`): `--background #f2f4f6`, `--card #ffffff`
— the chapter reads as a soft slate band. Light gradients re-declare in deep variants;
`shadow-soft/lift` apply on the base light ground too (cards float on paper).

### 2.3 Sanctioned decoration & chrome

- Gradients: `--gradient-ember` (rose→gold; deep variants in light), `--gradient-dusk`
  (atmosphere ≤18% alpha — also the shader field's static fallback), `.text-ember`.
- **One blur device**: the nav dusk-glass (`site-nav.tsx`). **No hero veil (v4.3):**
  legibility is sculpted into the shader itself — an elliptical *calm pocket* under the
  statement (knobs documented in `shader-field.tsx`); the `.graph-wash` seats the graph
  on a translucent gradient the shader breathes through; `.tile-hover` lets mosaic
  tiles warm under the pointer. Glassmorphism stays banned.
- **Shader field**: one hand-written WebGL fragment shader (domain-warped brand-color
  flow + drifting ember sparks), theme via uniforms from resolved tokens, lazy
  `ssr:false`, DPR-capped, paused offscreen, static frame under reduced motion.
- `.grain` texture ≤3%; **branded scrollbar** (clay/rose thumb, WebKit +
  `scrollbar-color`) — part of the brand surface.
- Shadows `soft/lift`: light-ground cards only (light base + light chapter); dark grounds
  stay flat with hairlines.

### 2.4 Typography (closed scale — same seven names)

Families: `--font-serif` **Instrument Serif** (400 + italic) · `--font-sans` **Manrope**
(variable — the distinctive working face). **No mono face loads (v4.1, ADR-0045).** All
next/font self-hosted. v4 retunes **display** for the two-line hero:
`clamp(2.625rem, 1.25rem + 6.5vw, 5.75rem)`; other scale values unchanged (display/title
serif via base layer; heading/lead/body/small/label all Manrope — label keeps its
0.08em tracking as the eyebrow voice). Serif emphasis = *italic*, never bold. Captions
never render as SVG `<text>`; numeric stats are Manrope `tabular-nums`.

### 2.5 Layout & rhythm

Container `max-w-6xl px-6 md:px-8`; section `py-24 md:py-32`; hero `min-h-svh` (statement
over the shader field) flowing seamlessly into the constellation band (~90svh, same
continuous ground — one wrapper, one shader canvas under both); ≥45% quiet ground per
band; 12-col asymmetric rows; spacing steps {1,2,3,4,5,6,8,10,12,16,20,24,32,36,44}.
Whitespace is compositional — no double-gapped seams, no cramped stacks (screenshot
checklist enforces).

## 3. Section archetypes (v4)

1. **`nav`** — **transparent at top** (no bg, no hairline); after ~8px scroll gains
   dusk-glass (`bg-background/85` + blur) + hairline. Draw-in underline links; primary
   CTA sm. **Mobile: full-screen overlay menu** — serif links staggering in, body
   scroll-locked, Escape + close button, focus moved in.
2. **`hero`** — the serif statement over the **shader field**, no overlay: the field
   keeps a calm pocket under the text (legibility by composition). Layers bottom→top:
   ground (+grain) → shader field (ssr:false; `.atmosphere` fallback) → eyebrow → serif
   `display` h1 (**exactly two nowrap lines**, one rose *italic*) → lead → CTA row. No
   graph in the hero.
3. **`constellation-band`** — directly south of the hero, same continuous ground/shader,
   **no visible boundary** (the veil and `.graph-wash` both fade open at the seam): the
   **canvas constellation** — deep nested knowledge graph (randomized per visit: hub /
   repos→files→symbols / git→commits / decisions→ADRs / memory→lessons / docs, plus an
   agents ring with **live session sub-nodes**), fixed three-quarter camera (constant
   pitch, no pointer tilt), depth fog, **20–40 concurrent packet dots** on randomized
   multi-hop routes with smooth glow arrivals, hover = subtree highlight + clamped
   tooltip, **click toggles a node off** (traffic reroutes/fizzles); telemetry
   right-aligned (simulation disclosed in the sr-only alternative); `aria-hidden` +
   keyboard-inert; reduced-motion = frozen layout, zero packets.
4. **`marquee-strip`** — agent **brand marks + names** (simple-icons, currentColor;
   wordmark fallback where no mark is published), hover-paused.
5. **`problem-band`** — the "why" (chapter band): serif statement + three pain
   illustrations (fading tiles / the context dump / the severed link), Reveal-staggered.
6. **`steps`** — three cards + the **pipeline illustration** (sources → mark → agents,
   flowing dashes; HTML chip labels, never SVG text) replacing any code block.
7. **`feature-row`** — text(5)/art(7) alternating; visuals are **brand-language
   illustrations** (assembly scene + token meter; mini effect-web on the graph engine;
   governance gate with constant-derived lanes) — never UI chrome; captions are HTML.
8. **`pricing-table`** — renders **from the `@tessera/billing` PLANS catalog** (workspace
   dependency; a unit test proves no number is hand-copied; `-1` entitlements render as
   unlimited). Plan cards on `Panel`; the recommended plan = `border-strong` + a Badge,
   **never a rose fill**; the contact-sales tier links to `/enterprise` (no dead ends).
9. **`faq`** (v4.5) — two-column: sticky `SectionHeading` left, disclosure list right.
   Items are `bg-card` hairline cards; still **native `details/summary`** (+ `name` for
   exclusive-open where supported — progressive enhancement, never a JS accordion).
10. **`cta-band`** — dusk atmosphere + quiet MosaicField + serif statement + primary CTA.
11. **`footer`** — columns, lockup, philosophy line, legal — **and the theme toggle**
    (labelled control, aria-pressed states).
12. **`page-header`** (v4.5, subpages only) — the subpage HERO: full-height
    (`min-h-svh`) statement over the **same shader-field ground as the homepage**
    (lazy WebGL, calm pocket under the text, atmosphere fallback, grain; the field
    dissolves at the section's foot via the `.fade-bottom` mask — no hard seam). Label
    eyebrow · serif h1 on the **`title` token** (`display` and its two-nowrap-line rule
    stay homepage-hero-only) · lead ≤56ch · optional CTA row · an optional **signature
    art** in the right column (PlanMosaic / TenantPerimeter / SkillLoop). **The
    constellation stays homepage-only.** Subpage sections compose the existing shapes;
    same-ground seams dissolve (washes), hairlines mark elevation changes only.

13. **`not-found`** (v4.6, the 404) — a quiet full-height statement on the base dusk/noon
    ground (no shader, no constellation): label eyebrow (`404 — page not found`) · serif
    `title`-token h1 (e.g. *"A tile is missing."*) · one body line · primary CTA home +
    TextLink to docs — with **Tess in the `lost` mood** beside the statement (its missing
    tile IS the 404 metaphor). Decorative (`aria-hidden`), still under reduced motion.
    The mascot's heart is the page's one gold moment.

**Banned archetypes:** terminal windows, code-block panels, file trees, fake dashboards,
browser-chrome screenshots.

## 4. Components (closed set)

`Container` · `Button` · `TextLink` · `Badge` · `Panel` · `SectionHeading` ·
**`PageHeader`** (subpage opening, v4.4) · `Wordmark` ·
`Logo/LogoIcon` · `MosaicField` · **`ShaderField`** (WebGL fragment shader, hero + band
ground) · **`Constellation`** (Canvas-2D knowledge-graph engine) ·
**`ConstellationBand`** (the band: lazy boundary, heading, telemetry chips, sr-only
alternative) · **`EffectWeb`** (mini React Flow) · **`PipelineFlow`** ·
**`CompilerAssembly`** · **`GovernanceGate`** · **`PlanMosaic`** (pricing hero — one
engine at three scales; plan names arrive via props from the PLANS display model) ·
**`TenantPerimeter`** (enterprise hero — isolation islands + refused crossing + live
ledger) · **`SkillLoop`** (skills hero — the agent discipline as a traveling ring) ·
**`ProblemBand` illustrations** ·
**`ThemeToggle`** (footer) · `Reveal` / `Marquee` / motion seam `lib/motion.tsx` (the
only framer-motion import) · **`Mascot`** (from `@tessera/mascot` — see §4.1). React
Flow imports live only in `components/art/*` (effect-web); canvas/WebGL engines live
only in `components/art/*`; `three`/`@react-three` are banned.

### 4.1 The mascot — Tess (v4.7, ADR-0046 v2)

Tess is the brand mascot from **`@tessera/mascot`** (shared workspace package): a cute
big-headed tessera creature — ink eyes, gilded heart, moods as data (BRAND.md §5). On
this surface:

- **Usage budget (lint-enforced `allowIn`):** the mobile-menu ground (`greeting`), the
  404 page (`lost`), and the constellation supervisor (`watching`, reacting to the same
  simulated telemetry as the island). **Never the hero, never pricing**, never inside
  content bands as decoration. The **`/dev/mascot` lab** is a sanctioned DEV exception
  (noindex; absent from sitemap/nav/llms.txt) for debugging every mood on both themes.
- **Alive by contract:** eyes blink and follow the pointer; the body breathes at
  creature rate (3–6s — field-art ambient stays 9–14s); per-mood gestures (curious
  tilt, alarmed shiver, lost scan, greeting wave). Hover = perk + gaze lock + ember
  flare; click = the one-shot *delight* hop (≤1.2s). Reactions are keyboard-neutral;
  **never place Tess inside `pointer-events-none`** (v1's dead-interaction bug).
- **Placement principle:** Tess overlays existing whitespace (absolute positioning,
  zero added layout height) — it fills dead corners, it never pushes content.
- **Accent interaction:** the heart renders on `--gold` — where Tess appears it **is**
  that band's one gold moment (§1.2). No second ember in the same band.
- **Theming:** globals.css binds the closed `--mascot-*` contract to Terra Mosaic tokens
  per theme (dusk + noon + chapter inherit). Components never restyle Tess directly.
- **Motion:** self-contained CSS + a tiny rAF gaze spring (package-internal; the framer
  seam is not involved), transform/opacity only, `prefers-reduced-motion` ⇒ designed
  still pose per mood, gaze and reactions disabled. Tess counts toward §5's ≤1 ambient
  system per viewport.
- **A11y:** decorative placements `aria-hidden` with no tab stop (+ sibling sr-only text
  where state matters); interactive placements are real buttons; Tess never carries
  information that isn't also text (the supervisor mirrors the telemetry island).

## 5. Motion — thermal system + the constellation

v2 rules stand (micro 150–250ms; reveals settle once; ≤1 ambient system per viewport;
gilded tile arrives once; reduced-motion = stillness). Additions:

| Layer | Spec |
|-------|------|
| Shader field | slow domain-warped flow (~0.02 uv/s) + ≤12 procedural ember sparks; downscaled DPR; paints every visible frame; reduced motion = frozen time |
| Constellation | fixed 3/4 camera (no tilt); Poisson packet spawns (20–40 alive), eased multi-hop travel; arrivals swell the glow smoothly (never a ring); hover/tooltip 150ms, tooltip clamped; toggle-off dims to outline |
| Canvas rules | page scroll always wins (no wheel/touch capture); keyboard-inert + `aria-hidden` (decorative-interactive); telemetry ticks 1.2–2s, right-aligned |
| Illustration loops | flowing dashes are that band's ambient system; assembly **breathes** (assemble–hold–disperse ping-pong) and the gate **cycles** on one shared clock — always eased, never jumping |
| Theme switch | radial view transition from the toggle (clip-path circle, 550ms house ease); instant without the API or under reduced motion |
| Mascot (Tess) | package-internal CSS + rAF gaze: every mood is an infinite ACTIVITY loop (typing/searching a mini graph/waving/cheering under confetti — hands + always-rendered props, v3), breath/bob 3–6s, blinks, mood morphs ≤700ms, hover perk + pointer-following eyes, click delight once ≤1.2s (counts as the viewport's ambient system; reduced motion ⇒ the still scene — pose + static prop) |
| Reduced motion | shader frozen; constellation frozen layout, zero packets; no dash animation; theme switch instant; Tess = designed still pose per mood |

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
the arc reads in both themes · **dark mode dark end-to-end** · serif voice present ·
**h1 exactly two lines at every width** · **no UI-chrome mockups anywhere** ·
constellation aligned/contained (zero overflow), packets visibly plural, node toggle
works · whitespace rhythm consistent · honest labels (`demo`) · mobile menu + toggle
usable · brand-swap test. Then the
[`design-review`](../../.harness/skills/design-review/SKILL.md) audit.

## 9. References

BRAND.md · terra-mosaic-philosophy.md · ADR-0042/0043/0044/0045 · theme-factory (Desert
Rose, Modern Minimalist) · @xyflow/react (effect-web miniature; dashboard precedent
F-043) · Awwwards evaluation research · manifest: marketing-design.manifest.json (v4).
