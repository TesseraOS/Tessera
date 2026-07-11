# Tessera — Brand Book (v1)

| Field | Value |
|-------|-------|
| **Status** | Accepted — F-051 overhaul (ADR-0043) |
| **Date** | 2026-07-07 |
| **Philosophy** | [Terra Mosaic](./brand/terra-mosaic-philosophy.md) (canvas-design movement) |
| **Theme lineage** | theme-factory **Desert Rose** (dark theme) + **Modern Minimalist** (light theme), adapted for a developer-tool brand (ADR-0044: dual themes, footer toggle) |
| **Applied by** | [`MARKETING-DESIGN.md`](./MARKETING-DESIGN.md) (site), logo assets in [`brand/`](./brand/) + `apps/marketing/public/brand/` |

## 1. Brand discovery

**What Tessera is:** the context & memory OS for AI coding agents — it assembles scattered
fragments (repos, decisions, memory) into one compiled, cited picture.

**The name is the brand.** A *tessera* is one tile of a mosaic. The entire identity is
built from that single idea: **many small pieces, patiently assembled, one gilded piece
arriving to complete the picture.** That gesture — the ember tile clicking into place — is
the logo, the hero animation, the loading state, the 404, everything.

**Brand attributes** (in tension, on purpose):
- *Warm* — desert palette, serif voice, human craft. Not another cold black-and-neon dev tool.
- *Precise* — measured grids, mono annotations, honest numbers. Not decoration.
- *Patient* — memory is long-term; the brand moves like warm air, never twitchy.
- *Accountable* — provenance, citations, audit. The brand shows its work.

**Personality in one line:** *an archivist with a jeweler's hands, working at dusk.*

**Explicitly not:** neon/indigo AI gradients, glassmorphism, particle storms,
eyes-and-gloves cartoon mascots (the geometric tessera figure Tess — §5 — is sanctioned
within its usage budget), fake testimonials, hype vocabulary.

## 2. Color — the "Terra Mosaic" palette

Fusion logic: Desert Rose supplies the soul (dusty rose `#d4a5a5`, clay `#b87d6d`, sand
`#e8d5c4`, deep burgundy `#5d2e46`); Modern Minimalist supplies the discipline (near-mono
composition, grayscale restraint, one accent at a time). Adapted for AA contrast on both
grounds.

### 2.1 Dusk ground (primary — dark, warm)

| Role | Hex | Notes |
|------|-----|-------|
| `background` | `#161013` | espresso-plum, never pure black |
| `surface` | `#1E1519` | raised bands |
| `card` | `#251A20` | panels |
| `foreground` | `#F4EDE7` | warm ivory |
| `muted-foreground` | `#B7A8A8` | body on dusk (≈7.6:1) |
| `faint-foreground` | `#968690` | metadata (≈5.0:1) |
| `rose` | `#E2A3A8` | **primary accent** — dusty rose, luminous (≈8.3:1) |
| `gold` | `#E4B65A` | **ember accent** — the arriving tile (≈9.4:1) |
| `clay` | `#C8836C` | tertiary warmth (illustrative tiles ≈5.6:1) |
| `burgundy` | `#5D2E46` | large quiet fills, gradient stop |
| `border` | `rgba(244,237,231,0.10)` | hairlines (strong: `0.18`) |

### 2.2 Sand ground (light bands — the "noon" chapter)

| Role | Hex | Notes |
|------|-----|-------|
| `background` | `#F1E8DF` | sand |
| `card` | `#FAF4EE` | warm paper |
| `foreground` | `#2B1E25` | espresso text (≈13:1) |
| `muted-foreground` | `#63525A` | body on sand (≈6.5:1) |
| `rose-deep` | `#9E4A56` | rose readable on sand (≈6:1) |
| `gold-deep` | `#7A5A1E` | gold readable on sand (≈6.3:1) |
| `border` | `rgba(43,30,37,0.14)` | |

### 2.3 Gradients & texture (tokenized — the only sanctioned ones)

- `--gradient-ember` — `linear-gradient(120deg, #E2A3A8, #E4B65A)`: the gilded tile, key
  words, hairline seams. Never body text, never full sections.
- `--gradient-dusk` — a radial rose/burgundy glow at ≤18% alpha: hero atmosphere only.
- **Grain** — an inline-SVG noise overlay at 2–3% opacity on dark bands: the "paper" that
  kills flat-black lifelessness. Pure CSS/SVG, no image files.

**Accent economics:** rose leads, gold punctuates (one ember moment per band), clay is
illustrative-only. Two accent families is the budget — never a third hue.

## 3. Typography

| Register | Face | Usage |
|----------|------|-------|
| **Display** | **Instrument Serif** (400 + italic) | headlines, big statements; *italic for the one emotional word*, often in rose |
| **Text/UI** | **Manrope** (variable) | body, nav, buttons — a distinctive, enterprise-grade working grotesque (ADR-0044) |
| **Witness** | **JetBrains Mono** | coordinates, citations, eyebrow labels — the developer-culture face |

Instrument Serif at large optical sizes is the brand's voice; Manrope keeps work plain but
never default; the mono register is the "archival annotation" from the philosophy. All
three are self-hosted (next/font — zero runtime third-party requests). Sentence case
everywhere; the serif never bolds (weight 400 is the aesthetic); emphasis = *italic* or
scale, not weight.

## 4. Logo system

**The mark:** a 3×3 mosaic of ivory tiles forming a rounded square — with the **top-right
tile lifted out of the grid, gilded in the ember gradient**, forever arriving. It encodes
the product (the missing context, delivered) and the philosophy (the tessera placed by
hand). Monochrome fallback: all-ivory (or all-espresso on light).

**Lockups:** horizontal (mark + `tessera` in Instrument Serif lowercase) and stacked.
Clearspace = one tile on all sides; minimum mark size 16px; never rotate, recolor outside
the palette, or place on non-brand backgrounds.

**Files** (masters in `docs/design/brand/`, web copies in `apps/marketing/public/brand/`):
`tessera-mark.svg`, `tessera-lockup.svg`, PNG exports (`-512/-1024`, dark/sand/transparent),
`tessera-brand-canvas.png` (the Terra Mosaic art piece). Regenerate PNGs with
`node apps/marketing/scripts/render-brand-assets.mjs` (Playwright, deterministic).

## 5. Mascot — Tess (ADR-0046)

**Tess is a living fragment of the mosaic:** a compact figure of **nine rounded-square
tesserae** — the mark's own geometry — with the **gilded ember tile as its heart**,
forever mid-assembly. Personality: *the archivist's apprentice* — curious, patient,
precise. Tess has **no face** (the eyes-and-gloves cartoon stays banned); expression is
pure brand language:

- **Posture** — tile arrangement: gathered = attentive, low = resting, scattered = alarmed.
- **Alignment** — a *misplaced tile* is distress; a perfectly seated grid is satisfaction.
- **Rhythm** — the heart-glow breathing rate and tile-drift cadence carry energy.
- **Light** — one ember sheen sweep is celebration: the arriving-tile gesture itself.

**Moods** (data-driven; the rig is the `@tessera/mascot` workspace package): core —
`idle`, `curious`, `working`, `satisfied`, `alarmed`, `celebrating`; surface — `greeting`
(menu), `lost` (404: one tile visibly missing), `searching` (empty states), `watching`
(telemetry supervisor). Every mood defines a reduced-motion still pose. New moods are
added as validated data (`defineMood()`), never by redrawing the figure.

**Usage budget:** menus, empty states, 404s, and the constellation supervisor — **never
the hero, never pricing**, never as the sole carrier of information. Where Tess appears,
its heart **is** that band's one gilded moment (§8 accent budget). Colors bind per
surface via the `--mascot-*` CSS contract; unthemed surfaces render Tess monochrome
(`currentColor`) — the same fallback stance as the logo.

**Masters** (generated from the rig's mood data — never hand-edited):
`brand/tessera-mascot.svg` (idle) + `brand/tessera-mascot-moods.svg` (mood sheet);
regenerate with `node packages/mascot/scripts/render-masters.mjs`.

## 6. Art direction (site + collateral)

- **The signature gesture:** tessellation fields — offset tile grids in rose/clay/gold on
  dusk, opacity-graded, one gilded tile animated into place. SVG-first, responsive, never
  raster where vector serves.
- **Product-true panels stay** (compile trace, effect graph, audit rows) — but *alive*:
  edges draw in, budgets fill, rows settle, scores count up when they enter view.
- **Composition:** ledger columns + one warm rupture per band (a serif statement at great
  scale, a rose field, a gilded seam). ≥50% quiet ground.
- **Chapters:** the page moves dusk → sand → dusk (dark hero, light middle band, dark
  close) — the emotional arc that flat single-ground pages lack.

## 7. Motion personality — "thermal"

Warm air, not machinery. Things **settle, drift, and glow**; they never bounce, spin, or
scroll-jack.

| Layer | Spec |
|-------|------|
| Micro (hover/press) | 150–250ms, ease-out; underline draws, button lifts 1–2px, gilded sheen sweeps once |
| Reveals (scroll into view) | opacity + 16–24px rise, 500–700ms cubic ease-out, stagger 60–90ms, once |
| Ambient (life) | mosaic tiles drift ≤6px over 9–14s loops; marquee ~40s linear, pauses on hover |
| Signature | the ember tile arrives once per page load (≤1.2s), then stillness |
| Always | `prefers-reduced-motion` ⇒ final layout, zero movement; LCP never animated from invisible |

## 8. Brand metrics (measurable, gate-backed)

- **Contrast:** every §2 pairing ≥4.5:1 body / ≥3:1 large — axe AA is a hard gate.
- **Accent budget:** ≤1 gilded (gold/ember) moment per band; rose ≤3 elements per viewport.
- **Motion budget:** ≤1 ambient system per viewport; reveal stagger total ≤700ms; zero
  layout-shift animation (CLS <0.05).
- **Performance:** LCP <2.0s, INP <200ms, first-load JS ≤240KB gz (framework baseline
  ~185KB + app/motion ≤55KB).
- **Honesty:** zero fabricated logos/testimonials/metrics (design-lint enforced).
- **Brand-swap test:** logo covered ⇒ still identifiable by tessellation + dusk/rose/gold +
  serif voice.

## 9. Appendix — image-generation prompts (optional raster art)

Everything on the site is SVG/CSS. If raster art is ever wanted (blog covers, social,
print), use these with ChatGPT (gpt-image) or Gemini (Imagen / "nano banana") — then
color-grade to §2:

1. **Hero texture plate** — *"Minimalist abstract mosaic of small rounded square ceramic
   tiles seen from above, deep espresso-plum background (#161013), tiles in warm ivory
   (#F4EDE7), dusty rose (#E2A3A8) and clay (#C8836C) with exactly one gilded amber tile
   (#E4B65A) catching soft light, most tiles dark and subtle, generous dark negative
   space, precise grid with slight organic offsets, soft studio lighting, matte finish,
   photographed like a museum artifact, no text, 16:9"*
2. **Memory strata** — *"Abstract archaeological cross-section of sediment layers rendered
   as thin horizontal strata of warm sand (#F1E8DF), clay, dusty rose and espresso tones,
   one thin gilded seam of amber running through, minimalist, high detail, quiet, no text,
   3:2"*
3. **The arriving tile (social)** — *"Macro photograph style render: a single glowing
   amber-gold ceramic tessera being placed by unseen force into a near-complete dark
   mosaic of espresso and ivory tiles, shallow depth of field, warm rim light, dark moody
   background, museum quality, no text, 1:1"*

Grade check after generation: sample dominant hexes; they must sit within ±8% of §2 values.
