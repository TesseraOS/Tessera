# Tessera — Marketing Design System (public surfaces)

| Field | Value |
|-------|-------|
| **Status** | Accepted v1.0 — F-051 |
| **Last updated** | 2026-07-07 |
| **Scope** | `apps/marketing` (apex domain). Later: the public chrome of `apps/docs`. |
| **Authority** | [ADR-0042](../adr/0042-marketing-site-design-direction.md) (direction locked) · [ADR-0035](../adr/0035-public-web-platform-three-surfaces.md) (three surfaces) |
| **Enforced by** | [`.harness/rules/frontend/marketing.md`](../../.harness/rules/frontend/marketing.md) · the **design-lint gate** (vitest in `apps/marketing`, driven by [`marketing-design.manifest.json`](./marketing-design.manifest.json)) · axe AA e2e · screenshot review ([`marketing-ui`](../../.harness/skills/marketing-ui/SKILL.md)) |

> **This document is binding for every pixel of the marketing site.** It exists because
> marketing pages are where generated UI degrades into "AI slop" — the dashboard's
> [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) governs an app shell and under-constrains
> long-form pages. Where the two documents disagree **on marketing pages, this one wins**;
> the shared principles (restraint over richness, legibility as luxury, functional motion,
> honesty) are identical. An agent that follows this document mechanically must land inside
> the intended visual quality — taste is encoded here, not improvised per session.

---

## 0. Direction (the north star)

**"A precision instrument, not a billboard."** Tessera sells to engineers who run AI
coding agents. The site must feel like the product: engineered, legible, quiet, exact.

- **Dark-only** (v1), near-black canvas, hairline borders, flat surfaces. No light theme,
  no theme toggle (ADR-0042 records the deviation and the revisit trigger).
- **Typography-led.** The hero is carried by type, spacing, and one product-true visual —
  not by imagery, gradients, or decoration.
- **Monochrome + one accent.** Everything is a neutral; **emerald** is the only hue and
  appears **at most twice per viewport** (§2.1). Emerald is already the dashboard's single
  functional color — the brand carries across surfaces.
- **The signature visual is the tessera mosaic**: scattered fragments (context) assembling
  into a solid core (a compiled Context Package) — the logo's own narrative. Built from
  DOM/SVG rectangles on the token palette. Never stock art, never 3D blobs, never particles.
- **Aesthetic family:** Linear / Vercel / Stripe-docs restraint. Explicitly **not**: the
  purple-gradient SaaS template, glassmorphism, confetti landing pages.

## 1. Non-negotiables (memorize these ten)

1. **Tokens only.** Every color/radius/shadow/font value comes from §2. No raw Tailwind
   palette classes (`emerald-400`, `zinc-800`, …), no arbitrary color/size brackets, no hex
   in components. The design-lint gate fails the build on violations.
2. **Accent budget: ≤ 2 emerald elements per viewport-height of page.** Everything else
   neutral. Emerald never fills large areas; it marks *the* action or *the* insight.
3. **No decoration without information.** No gradient text, no glow, no glassmorphism, no
   drop shadows, no particle/orb/3D backgrounds, no carousels, no marquee auto-scrollers.
4. **Hero H1 is server-rendered and immediately visible.** Never animate the LCP element
   from `opacity: 0`; no typing effects, no word-cycling.
5. **Honest content only.** No invented logos, testimonials, star ratings, user counts, or
   metrics. Numbers must trace to code or docs (pricing ← `@tessera/billing` PLANS; limits
   ← config). Integration names are set as **typographic wordmarks**, not scraped logos.
6. **Sentence case everywhere** — headings, buttons, nav. No Title Case, no ALL CAPS
   (exception: the mono eyebrow, §3.4). No exclamation marks. No emoji.
7. **One `h1` per page; heading levels never skip.** Sections are `<section>` with an
   accessible heading — hierarchy comes from the type scale, not from eyebrows on every
   block (one eyebrow per page, hero only).
8. **Motion is CSS-only, subtle, and `prefers-reduced-motion`-safe** (§5). No
   framer-motion in this app (v1), no scroll-jacking, no parallax, no page-level fades.
9. **Static-first, zero client data fetching, zero third-party requests.** No analytics
   scripts, no external fonts/CDNs, no iframes, no cookie banner (because no cookies).
   The site never calls the authenticated API and holds no credentials (NFR-17).
10. **Screenshot-verified before "done".** Desktop 1440 & 1280, mobile 375, full-page,
    plus reduced-motion — reviewed against §8. "It renders" is not "it's right."

## 2. Tokens (exact values — copy verbatim into `app/globals.css`)

Semantic CSS variables, same naming convention as the dashboard so component idioms port.
Values are **marketing's own** (dark-only). Components reference tokens only.

### 2.1 Color

| Token | Value | Use |
|-------|-------|-----|
| `--background` | `#030303` | page canvas |
| `--foreground` | `#f5f5f5` | headings, primary text |
| `--muted-foreground` | `#a1a1a1` | body/secondary text (7.4:1 on canvas) |
| `--faint-foreground` | `#8a8a8a` | small meta only — captions, footer legal (5.3:1) |
| `--surface` | `#0a0a0a` | alternate section bands |
| `--card` / `--card-foreground` | `#101010` / `#f5f5f5` | bordered panels, code headers |
| `--primary` / `--primary-foreground` | `#fafafa` / `#0a0a0a` | **the** primary CTA (near-white button) |
| `--secondary` / `--secondary-foreground` | `#1a1a1a` / `#f5f5f5` | secondary buttons |
| `--accent` / `--accent-foreground` | `#34d399` / `#04150d` | emerald — see accent budget |
| `--border` | `rgba(255,255,255,0.08)` | hairlines (default border) |
| `--border-strong` | `rgba(255,255,255,0.16)` | interactive/hover borders |
| `--input` | `rgba(255,255,255,0.12)` | form fields (contact/CTA forms only) |
| `--ring` | `#34d399` | focus rings (functional accent use — free of budget) |
| `--code` | `#0c0c0c` | code block background |

**Accent budget rules:** emerald may appear as (a) small text/glyph highlights, (b) the
assembled-core tiles in the mosaic visual, (c) focus rings, (d) ≤ 1 accent border or badge
per section. It may **never** fill a button larger than a badge, tint a whole section, or
color body text. The primary CTA is **near-white**, not emerald.

### 2.2 Radius, elevation, z-index

- `--radius: 0.65rem` (same as dashboard); derived `sm/md/lg/xl` via calc. Buttons/badges
  `md`, panels/code `lg`, never `rounded-full` except avatar-free dot indicators.
- **Elevation: none.** Surfaces separate by background step + hairline border. `shadow-*`
  utilities are banned (design-lint); `shadow-none` allowed.
- z-index ladder: `base 0 · nav 40 · overlay 50`. Nothing else.

### 2.3 Typography

Families: **Geist Sans** (display + body) and **Geist Mono** (labels, code, wordmarks) via
the `geist` package — self-hosted, no font CDN. Type scale is a **closed set** — the only
text sizes on the site (Tailwind v4 `@theme` tokens → `text-display` etc.):

| Token | Size | LH | Tracking | Weight | Role |
|-------|------|----|----------|--------|------|
| `display` | `clamp(2.75rem, 4.5vw + 1.5rem, 4.75rem)` | 1.04 | −0.035em | 600 | hero `h1` only |
| `title` | `clamp(1.875rem, 2vw + 1.25rem, 2.625rem)` | 1.12 | −0.025em | 600 | section `h2` |
| `heading` | `1.375rem` | 1.35 | −0.015em | 500 | `h3` (feature rows, cards) |
| `lead` | `1.1875rem` | 1.55 | −0.005em | 400 | hero subhead, section intros |
| `body` | `1rem` | 1.65 | 0 | 400 | prose |
| `small` | `0.875rem` | 1.55 | 0 | 400 | secondary UI text |
| `label` | `0.8125rem` | 1.4 | +0.06em | 500 | **mono** — eyebrow, wordmarks, code captions |

Rules: headings get `text-wrap: balance`, prose gets `text-wrap: pretty`. Measures: lead
≤ 56ch, body 60–72ch. Headlines ≤ 8 words; subheads ≤ 2 sentences. No `font-black`, no
`italic`, no `underline` for emphasis (underline is for links only).

### 2.4 Spacing & layout

- **Container:** one component — `mx-auto w-full max-w-6xl px-6 md:px-8`. Nothing outside
  it except full-bleed section band backgrounds and hairlines.
- **Section rhythm:** `py-24 md:py-32`. Hero: `pt-36 md:pt-44 pb-20 md:pb-24`. Consecutive
  bordered bands may collapse to `py-20`. Never less than `py-16` for a top-level section.
- **Inside a section:** heading → body `mt-4/mt-5`; body → CTA `mt-8/mt-10`; heading block →
  content grid `mt-12/mt-16`. Stick to spacing steps {1,2,3,4,5,6,8,10,12,16,20,24,32,36,44}.
- **Grid:** 12-col (`grid-cols-12`) for asymmetric feature rows (text 5 / visual 7);
  simple `grid-cols-2/3/4` for footer and step grids. Flex for 1-D rows only.
- **Full width backgrounds, contained content.** Band separation = background step
  (`--surface`) + top/bottom hairline, not shadows.

## 3. Section inventory (the only allowed archetypes)

Pages are composed **only** from these archetypes, each with fixed anatomy. Inventing a new
archetype requires updating this doc (and re-running design review) — not improvising.

### 3.1 `nav`
Height `h-16`, sticky, hairline `border-b`, background `--background` at 92% opacity +
`backdrop-blur` (the **only** place blur is allowed). Left: mosaic logo + wordmark. Center/right:
≤ 5 text links (`small`, muted → foreground on hover). Right: 1 secondary link ("Sign in")
+ 1 primary button sm ("Start free" → app subdomain). Mobile: disclosure panel, focus-trapped,
Esc closes.

### 3.2 `hero` (one per page; the homepage showpiece)
Anatomy, top to bottom, left-aligned or centered (choose per page, homepage: **centered**):
1. Eyebrow — mono `label`, uppercase allowed, ≤ 6 words, muted; the page's **only** eyebrow.
2. `h1` — `display`, ≤ 8 words, sentence case, `--foreground`; may mark **one** word/phrase
   with emerald (counts against the accent budget).
3. Subhead — `lead`, muted, ≤ 56ch, states *what it is + for whom* concretely.
4. CTA row — exactly 1 primary + 1 secondary/ghost. Nothing else (no badge rows, no avatar
   stacks, no "backed by").
5. Signature visual — the mosaic assembly OR a product-true panel (compiled Context Package
   with citations). Bordered panel on `--card`/`--code`, monochrome + emerald core tiles.

### 3.3 `proof-strip`
One line of **typographic wordmarks** (mono `label`, muted) of real MCP clients: Claude
Code, Cursor, Cline, Codex CLI, Continue — preceded by a small caption ("Works with any
MCP-capable agent"). Static; no logos, no marquee animation.

### 3.4 `feature-row` (differentiators)
12-col asymmetric: text block (cols 1–5) — `h3` `heading` ≤ 6 words, body ≤ 280 chars,
optional mono caption or inline `TextLink` — and a visual panel (cols 6–12): bordered,
product-true diagram/mock built from tokens (no screenshots-of-nothing). Alternate sides
row to row; max 3 rows in a sequence; rows separated by `mt-20 md:mt-28`.

### 3.5 `steps` (how-it-works)
2–4 ordered steps. Small mono step numbers (`01`–`04`) are allowed **here only** (a real
sequence, not decorative scaffolding). Each step: `heading` ≤ 5 words + body ≤ 200 chars.
May embed one `code-block`.

### 3.6 `code-block`
Real, runnable content only (MCP config, CLI commands, API calls) — never pseudo-code
gibberish. `--code` background, hairline border, `lg` radius, header bar (`--card`) with a
mono filename/label. Mono `label` size, syntax highlighting monochrome + emerald strings
at most. Optional copy button (small client island).

### 3.7 `pricing-table`
Columns rendered **from `@tessera/billing` PLANS** (never hand-copied numbers). Neutral
cards, hairline borders; the recommended plan gets `border-strong` + a small mono badge —
not an emerald fill, no "most popular" ribbons.

### 3.8 `faq`
Accordion (native `<details>` or headless disclosure), hairline dividers, `heading`-sized
questions, body answers. No card-per-question grids.

### 3.9 `cta-band`
`--surface` band with hairlines: `h2` `title` ≤ 7 words + 1 primary CTA (+ optional ghost).
No gradient backgrounds, no emerald fills.

### 3.10 `footer`
Top hairline. 3–4 link columns (`small`, muted; mono column titles) + logo block with the
one-line positioning statement + legal line (`--faint-foreground`). No newsletter form v1.

## 4. Components (closed set, `components/ui/`)

`Container` · `Button` (variants `primary | secondary | ghost`; sizes `sm | md | lg`; cva
pattern, tokens only) · `TextLink` (underline `decoration-(--border-strong)` → foreground on
hover) · `Badge` (mono label, hairline border, transparent bg) · `Panel` (bordered `--card`
surface) · `CodeBlock` · `SectionHeading` (h2 + optional lead) · `Wordmark` · `LogoIcon`
(port from `apps/web/components/logo.tsx` — same mark, no redesign).

Need something else? Compose these. A new primitive requires adding it here first.

## 5. Motion (CSS-only, v1)

- **Allowed:** ≤ 300ms ease-out entrance (opacity + ≤ 12px translate) on *secondary*
  elements; hover/focus transitions ≤ 200ms on `color/background/border/transform`;
  the mosaic assembly animating **once** on load (≤ 900ms, ease-out, then static).
- **Banned:** animating the `h1`/LCP from invisible; infinite loops (pulse/bounce/marquee);
  scroll-jacking/parallax; `transition-all`; animating `width/height/top/left` (compositor
  properties only); staggered reveals longer than 600ms total.
- Every animation sits behind `@media (prefers-reduced-motion: no-preference)`; the
  reduced-motion experience is the complete, final layout (global kill-switch in CSS too).

## 6. Voice & content

- Confident, concrete, technical. Name real mechanisms: *compiles*, *cites*, *budgets*,
  *effect-links*, *audit log* — specificity is the brand. Say what the product does, not
  what the reader will feel.
- Banned vocabulary (gate-enforced): *unleash, supercharge, revolutionize, game-changing,
  blazing(ly), effortless(ly), seamless(ly), magic(al), 10x, next-level, turbocharge*.
- No rhetorical questions as headlines. No "Trusted by" / "Loved by" unless backed by named,
  permissioned customers (none yet — so: absent).
- CTAs are verbs: "Start free", "Read the docs", "Deploy self-hosted". Primary CTA →
  `NEXT_PUBLIC_APP_URL`; docs links → `NEXT_PUBLIC_DOCS_URL`. No hardcoded domains.

## 7. Accessibility, SEO, performance (gates)

- **WCAG 2.1 AA** (axe in e2e, zero violations): semantic landmarks (`header/main/footer`),
  one `h1`, labelled controls, `--ring` focus visible on every interactive element, full
  keyboard paths incl. mobile nav, AA contrast (§2.1 pairs are pre-verified — don't invent
  new pairs), no horizontal overflow at 375px.
- **SEO baseline:** per-page `metadata` (title ≤ 60ch, description 140–160ch), canonical,
  OpenGraph + Twitter card (1200×630, generated from tokens), `sitemap.ts`, `robots.ts`,
  **`llms.txt`** (agent-readable index — ADR-0036). `NEXT_PUBLIC_SITE_URL` drives absolute
  URLs.
- **Performance (NFR-17):** static generation for every route; zero client data fetching;
  client islands only for nav toggle + copy buttons; first-load JS ≤ 130KB gz per page;
  images via `next/image`; fonts self-hosted with `display: swap`. Targets: LCP < 2.0s,
  CLS < 0.05, INP < 200ms. Record `next build` route output as evidence until the
  `web-perf` gate activates (F-049).

## 8. Review protocol (before any marketing UI is "done")

1. **design-lint** (vitest) green — banned patterns are compiled from
   [`marketing-design.manifest.json`](./marketing-design.manifest.json).
2. **e2e + axe** green.
3. **Screenshots** at 1440×900, 1280×800, 375×812 (full-page, plus reduced-motion) reviewed
   against this checklist:
   - [ ] Hierarchy obvious at arm's length: one primary action per viewport.
   - [ ] Accent budget respected (count the emerald).
   - [ ] Spacing rhythm consistent (no cramped or double-gapped seams between sections).
   - [ ] Type scale only (no in-between sizes), measures within limits, no orphan words in
         headlines (`text-wrap: balance` doing its job).
   - [ ] Every border a hairline from tokens; no shadows, gradients, or glass anywhere.
   - [ ] Content honest (no fabricated anything); copy passes §6.
   - [ ] Mobile: no overflow, nav usable, tap targets ≥ 44px.
   - [ ] The "brand-swap test": screenshot with the logo covered — if the page could be any
         AI SaaS template, it fails. The mosaic motif + emerald-on-monochrome + voice should
         identify Tessera.
4. **[`design-review`](../../.harness/skills/design-review/SKILL.md) skill pass** — for
   marketing pages its anti-pattern detectors run **on top of** this document.

## 9. References

Direction grounded in: unabyss.com (the positioning reference we exceed — dark, minimal,
integrations wall), Linear/Vercel/Stripe (typographic restraint), the dashboard's
[`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) (token architecture, honesty rule, motion
principles). Machine-readable projection: [`marketing-design.manifest.json`](./marketing-design.manifest.json).
