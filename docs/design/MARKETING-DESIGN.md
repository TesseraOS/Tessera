# Tessera — Marketing Design System v2 (public surfaces)

| Field | Value |
|-------|-------|
| **Status** | Accepted v2.0 — F-051 overhaul ("Terra Mosaic") |
| **Last updated** | 2026-07-07 |
| **Scope** | `apps/marketing` (apex domain). Later: the public chrome of `apps/docs`. |
| **Brand** | [`BRAND.md`](./BRAND.md) + [Terra Mosaic philosophy](./brand/terra-mosaic-philosophy.md) — read both first |
| **Authority** | [ADR-0043](../adr/0043-terra-mosaic-brand-and-marketing-overhaul.md) (direction) · [ADR-0042](../adr/0042-marketing-site-design-direction.md) (enforcement mechanism) · [ADR-0035](../adr/0035-public-web-platform-three-surfaces.md) |
| **Enforced by** | design-lint (vitest, compiles [`marketing-design.manifest.json`](./marketing-design.manifest.json)) · axe AA e2e · screenshot review (§8) |

> **Binding for every pixel of the marketing site.** v1's austerity was rejected by the
> project lead as lifeless; v2 encodes the corrected ambition: **a warm, artistic,
> animated, award-grade surface** (Awwwards lens: design 40 / usability 30 / creativity 20
> / content 10) that still never lies, never excludes, and never ships slop. Where this
> document and the dashboard's DESIGN-SYSTEM.md disagree on marketing pages, this wins.

---

## 0. Direction — Terra Mosaic

**"An archivist with a jeweler's hands, working at dusk."** The desert at last light:
warm darkness, rose and ember accents, sand interludes. The recurring gesture is the
**tessera** — fields of small tiles patiently assembled, one gilded tile forever arriving.

- **Two grounds, one theme:** default **dusk** (espresso-plum `#161013`) and scoped
  **sand** bands (`#F1E8DF`) via `data-band="sand"` — the page breathes dusk → sand →
  dusk. Never a theme toggle, never `dark:` variants.
- **Serif voice:** Instrument Serif carries the statements (never bold — *italic* is the
  emphasis); Instrument Sans works; Geist Mono witnesses (coordinates, citations, labels).
- **Alive, not busy:** grain on the dark grounds, one ambient tessellation per viewport,
  reveals that settle like warm air, microinteractions on everything touchable — and
  stillness as the default state.
- **Still explicitly not:** indigo/neon AI gradients, glassmorphism, particle storms,
  3D blobs, carousels, fabricated social proof, hype vocabulary.

## 1. Non-negotiables (the ten)

1. **Tokens only** (§2) — no raw palette classes, no arbitrary bracket values, no hex in
   components. Gate-enforced.
2. **Accent budget:** rose ≤3 elements per viewport; **gold/ember ≤1 moment per band**
   (the arriving tile, an ember word, or a gilded seam — one). Focus rings are free.
3. **Decoration must be sanctioned:** the only gradients are `--gradient-ember`,
   `--gradient-dusk`, and the `.text-ember` treatment — all defined once in
   `globals.css`. Soft shadows only on sand-band cards via `shadow-soft`/`shadow-lift`.
   Grain ≤3% opacity. Everything else decorative is banned.
4. **Hero H1 is server-rendered and immediately visible.** No typing effects, no
   word-cycling, LCP never animated from invisible.
5. **Honest content only.** No invented logos/testimonials/ratings/metrics; pricing from
   `@tessera/billing` PLANS; integrations as typographic wordmarks; product visuals mirror
   real surfaces (compile trace, effect graph, audit rows).
6. **Sentence case everywhere; serif never bold; no emoji; no exclamation marks.** The
   mono eyebrow (hero) and mono labels may be uppercase.
7. **One `h1` per page; heading levels never skip;** every section landmark labelled.
8. **Motion is the thermal system (§5)** — framer-motion only through the `lib/motion.tsx`
   seam; everything `prefers-reduced-motion`-safe (reduced = complete, still layout); no
   scroll-jacking; no `transition-all`; ≤1 ambient system per viewport.
9. **Static-first, zero client data fetching, zero third-party requests.** Fonts
   self-hosted (next/font); no analytics, no iframes, no cookies (NFR-17).
10. **Screenshot-verified before "done"** (§8): 1440/1280/375, full-page, reduced-motion,
    both grounds — plus the brand-swap test.

## 2. Tokens (exact values — `app/globals.css` is the single source)

### 2.1 Dusk ground (`:root`, default)

| Token | Value | Use |
|-------|-------|-----|
| `--background` | `#161013` | page canvas (espresso-plum) |
| `--surface` | `#1E1519` | raised bands |
| `--card` / `--card-foreground` | `#251A20` / `#F4EDE7` | panels |
| `--foreground` | `#F4EDE7` | headings, primary text (warm ivory) |
| `--muted-foreground` | `#B7A8A8` | body (≈7.6:1) |
| `--faint-foreground` | `#968690` | metadata (≈5.0:1) |
| `--primary` / `--primary-foreground` | `#F4EDE7` / `#261720` | primary CTA (ivory; hovers to rose) |
| `--secondary` / `--secondary-foreground` | `#2A1E24` / `#F4EDE7` | secondary buttons |
| `--rose` (= `--accent`) / `--rose-foreground` | `#E2A3A8` / `#2B1218` | **primary accent** (≈8.3:1 as text) |
| `--gold` | `#E4B65A` | ember punctuation (≈9.4:1) |
| `--clay` | `#C8836C` | illustrative tiles only |
| `--burgundy` | `#5D2E46` | quiet large fills, gradient stop |
| `--border` / `--border-strong` | `rgba(244,237,231,0.10)` / `0.18` | hairlines |
| `--input` | `rgba(244,237,231,0.14)` | fields |
| `--ring` | `#E2A3A8` | focus (free of budget) |
| `--code` | `#120D10` | code/terminal panels (stays dusk on every ground) |

### 2.2 Sand ground (`[data-band='sand']` — scoped overrides)

| Token | Value |
|-------|-------|
| `--background` `#F1E8DF` · `--surface` `#EADFD3` · `--card` `#FAF4EE` |
| `--foreground` `#2B1E25` · `--muted-foreground` `#63525A` · `--faint-foreground` `#7E6B73` |
| `--primary` `#2B1E25` / `--primary-foreground` `#F4EDE7` · `--secondary` `#E3D6C9` / fg `#2B1E25` |
| `--rose` `#9E4A56` / fg `#FBF3EE` · `--gold` `#7A5A1E` · `--border` `rgba(43,30,37,0.14)` / strong `0.26` · `--ring` `#9E4A56` |

Sand-band cards may carry `shadow-soft` (rest) / `shadow-lift` (hover). Dusk stays flat +
hairlines. Code panels keep dusk tokens on both grounds.

### 2.3 Gradients, texture, glow (sanctioned set — defined once in globals)

- `--gradient-ember: linear-gradient(120deg, #E2A3A8, #E4B65A)` — the gilded tile, the
  `.text-ember` word, one hairline seam per page. (The build-time OG/icon renderers
  reproduce the gradient by value — the same design-lint exception class as hex, since
  `ImageResponse` cannot consume CSS variables.)
- `--gradient-dusk` — radial rose/burgundy atmosphere ≤18% alpha, hero + CTA backdrops only.
- `.text-ember` — display-only gradient text (background-clip); counts as the band's gold
  moment; never on body text.
- `.grain` — SVG turbulence overlay, ~2.8% opacity, dark grounds only.
- Shadows: `--shadow-soft`, `--shadow-lift` (see @theme) — sand-band cards only.

### 2.4 Typography (closed scale — same seven names as v1, new voices)

Families: `--font-serif` **Instrument Serif** (400 + italic) · `--font-sans`
**Instrument Sans** (variable) · `--font-mono` **Geist Mono**. All next/font self-hosted.

| Token | Face | Size | LH | Tracking | Weight | Role |
|-------|------|------|----|----------|--------|------|
| `display` | serif | `clamp(3.25rem, 6vw + 1.5rem, 6.75rem)` | 1.02 | −0.01em | 400 | hero h1 only |
| `title` | serif | `clamp(2.375rem, 3vw + 1.25rem, 3.875rem)` | 1.08 | −0.005em | 400 | section h2 |
| `heading` | sans | `1.5rem` | 1.3 | −0.01em | 500 | h3 |
| `lead` | sans | `1.25rem` | 1.55 | 0 | 400 | subheads, intros |
| `body` | sans | `1.0625rem` | 1.65 | 0 | 400 | prose |
| `small` | sans | `0.9375rem` | 1.5 | 0 | 400 | secondary UI |
| `label` | mono | `0.8125rem` | 1.4 | +0.08em | 500 | eyebrow, wordmarks, annotations |

`h1/h2` get the serif family in the base layer; *italic* (often rose) is the only emphasis
inside display/title. Headings `text-wrap: balance`, prose `pretty`; lead ≤56ch, body
60–72ch; headlines ≤8 words; sentence case.

### 2.5 Layout & rhythm

Container `max-w-6xl px-6 md:px-8`. Bands: full-bleed ground + hairline seams; section
padding `py-24 md:py-32` (hero `pt-28 md:pt-36`); ≥50% quiet ground per band. 12-col grid
for asymmetric rows (5/7); spacing steps {1,2,3,4,5,6,8,10,12,16,20,24,32,36,44}.

## 3. Section archetypes (v2 — the only allowed shapes)

1. **`nav`** — sticky, dusk at 88% + blur (only blur allowed), hairline on scroll. Links
   with **draw-in underlines**; primary CTA sm. Mobile: focus-managed disclosure.
2. **`hero`** — eyebrow (mono, the page's only eyebrow) → serif `display` h1 (one *italic
   rose* word; optionally one `.text-ember` word = the band's gold) → lead → CTA row →
   **the living mosaic**: an ambient SVG tessellation field with the gilded tile arriving
   once, `--gradient-dusk` atmosphere behind. Art is `aria-hidden` with a text
   alternative.
3. **`marquee-strip`** — MCP-client wordmarks, slow linear loop (~40s), **pauses on
   hover/focus**, static row under reduced motion. Honest names only.
4. **`steps`** — ordered 01–03 (mono numerals allowed here only), connector line draws in
   on view; may embed one `code-block`.
5. **`feature-row`** — 12-col asymmetric text(5)/visual(7), alternating; the visual is a
   **living product panel** (compile trace filling, effect graph drawing its edges, audit
   rows settling) triggered once in view.
6. **`sand-band`** — a light chapter wrapping steps/features: `data-band="sand"`,
   `shadow-soft` cards permitted, serif `title` intro.
7. **`code-block`** — real content only; dusk `--code` panel on every ground; scrollable
   ⇒ `tabIndex=0 role="region"` + label.
8. **`pricing-table`** — from PLANS (F-030); recommended plan = `border-strong` + mono
   badge, never a rose fill.
9. **`faq`** — native disclosure, hairline dividers.
10. **`cta-band`** — dusk, `--gradient-dusk` + a quiet mosaic field behind a serif `title`
    statement + primary CTA (magnetic hover ≤4px).
11. **`footer`** — dusk; link columns (mono column titles), lockup + one-line positioning,
    legal in faint.

## 4. Components (closed set)

`Container` · `Button` (primary ivory→rose hover sheen | secondary | ghost; sm/md/lg;
lifts 1px on hover, settles on press) · `TextLink` (underline draws) · `Badge` · `Panel` ·
`CodeBlock` · `SectionHeading` (serif h2 + lead) · `Wordmark` · `Logo/LogoIcon` (the v2
mark) · **`MosaicField`** (seeded, deterministic tessellation; ambient drift; the one
gilded tile) · **`Reveal`** (in-view rise, stagger ≤700ms total) · **`Marquee`** ·
**motion seam `lib/motion.tsx`** (LazyMotion + `m` + `MotionConfig reducedMotion="user"`
— the only file importing framer-motion).

## 5. Motion — the thermal system

Warm air, not machinery: things **settle, drift, glow once**. Never bounce, spin, flash,
or scroll-jack.

| Layer | Spec |
|-------|------|
| Micro | 150–250ms ease-out: underline draw, button lift 1–2px + sheen sweep (once), icon nudge, copy-button morph |
| Reveal | opacity + 16–24px rise, 500–700ms, cubic ease-out, stagger 60–90ms, `once: true`, triggered ~20% in view |
| Living panels | in-view once: budget bar fills (~800ms), SVG edges draw (stroke-dashoffset), rows cascade |
| Ambient | ≤1 system/viewport: mosaic tiles drift ≤8px over 9–14s alternating loops; marquee ~40s linear, hover/focus-paused |
| Signature | the gilded tile arrives once per page load (≤1.2s), then stillness |
| Rules | LCP visible immediately · reduced-motion ⇒ final layout, zero movement (global kill-switch + MotionConfig) · transform/opacity only · no `transition-all` · framer-motion imported only by `lib/motion.tsx` |

## 6. Voice & content — unchanged from v1

Concrete mechanisms (*compiles, cites, budgets, effect-links, audit*), sentence case, no
hype vocabulary (gate list), no fabricated anything, numbers only from code/docs, CTAs are
verbs, URLs from `NEXT_PUBLIC_*`. The serif voice earns one poetic line per page (the
hero); everything else stays plainspoken.

## 7. Accessibility, SEO, performance

- **WCAG 2.1 AA (axe, zero violations) on both grounds**; §2 pairs are pre-verified —
  don't invent new ones. Landmarks, one `h1`, visible `--ring` focus, keyboard paths incl.
  mobile nav + paused-marquee focus, no 375px overflow. Ambient/live panels `aria-hidden`
  with text equivalents.
- **SEO:** per-page metadata, canonical, OG (brand plate), `sitemap.ts`, `robots.ts`,
  `llms.txt` (ADR-0036).
- **Performance:** static rendering; client islands = nav, motion seam consumers,
  marquee, copy buttons; **first-load JS ≤240KB gz** (Next 16 app-router baseline is
  ~185KB — the budget caps app code + motion at ~55KB on top; Lighthouse-based CWV
  enforcement lands with F-049); LCP <2.0s, CLS <0.05, INP <200ms;
  fonts `display: swap`; record `next build` route output as evidence until `web-perf`
  activates (F-049).

## 8. Review protocol (before any marketing UI is "done")

1. design-lint green (manifest-compiled; **fix code, never patterns** — pattern/allowIn
   edits are reviewed design decisions).
2. Gates + axe AA green.
3. **Screenshots** at 1440×900, 1280×800, 375×812 — full-page, reduced-motion pass, and
   both grounds — against:
   - [ ] One primary action per viewport; hierarchy at arm's length.
   - [ ] Accent budgets (count rose; find the single gold moment per band).
   - [ ] The dusk→sand→dusk arc reads; seams are hairlines, not mud.
   - [ ] Serif voice present (hero + section titles); *italic* emphasis, no bold serif.
   - [ ] Motion: ambient ≤1 per viewport; nothing loops garishly; reduced-motion = still.
   - [ ] Honest content; §6 voice.
   - [ ] Mobile: no overflow, nav + marquee usable, tap targets ≥44px.
   - [ ] **Brand-swap test:** cover the logo — tessellation + dusk/rose/gold + serif must
         still say Tessera.
4. [`design-review`](../../.harness/skills/design-review/SKILL.md) audit on top (its
   generic detectors defer to this document's sanctioned set).

## 9. References

BRAND.md (palette lineage: theme-factory Desert Rose × Modern Minimalist) ·
terra-mosaic-philosophy.md · unabyss.com (positioning reference to exceed) · Awwwards
scoring (40/30/20/10) · machine projection: marketing-design.manifest.json (v2).
