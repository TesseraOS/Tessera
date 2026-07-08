# ADR-0045: Marketing v4 — shader-field hero, canvas constellation graph, theme-true chapter bands

- **Status:** Accepted (builds on ADR-0044's dual themes / illustration-first / live-graph directives)
- **Date:** 2026-07-08
- **Deciders:** Project lead (fourth stakeholder review directives) + F-051 session
- **Tags:** frontend, design, brand, marketing, harness

## Context

The fourth stakeholder review found v3's hero graph **underwhelming**: one edge pulse at a
time is not "heavy randomized parallel traffic"; six sources → hub → four agents is not a
"deep nested knowledge graph"; the h1 wraps mid-sentence at large sizes; the graph and the
statement fight for legibility (a gradient scrim without blur). Two differentiator
illustrations (compiler assembly, governance gate) were called out as small, washed out, and
visibly misaligned (hand-tuned magic offsets). Tiny 10–12px mono `<text>` rendered inside
SVGs reads like an unhinted default mono ("Roboto Mono feel"). And the v2/v3 "sand chapter"
— a light band forced into the **dark** theme — was vetoed: dark mode must stay dark.

The stakeholder sketched the direction: hero = statement over a smooth animated shader
background; the full knowledge graph moves **south of the hero** as its own live band on the
same continuous ground; traffic = many concurrent randomized dots moving through nodes;
nodes clickable (toggle off); the graph should *portray* premium 3D without real 3D code.
Target: Awwwards submission quality.

## Decision

1. **Hero recomposition (layer stack, bottom → top):** ground (`--background` + grain) →
   **shader field** → **legibility veil** → text. The h1 is locked to **exactly two lines**
   ("Your agents forget." / "Tessera *remembers*.") via per-line nowrap spans and a retuned
   `--text-display` clamp, screenshot-verified 375→1440. The knowledge graph leaves the hero.
2. **Shader field, hand-written WebGL — no 3D engine.** A single fragment shader
   (`components/art/shader-field.tsx`) renders slow domain-warped noise flowing in brand
   colors (dusk: burgundy/rose/gold embers over espresso; noon: whisper slate/rose over
   near-white) plus a few procedural drifting ember sparks — the hero's hint of the traffic
   below. Theme fed as uniforms from resolved CSS tokens. Discipline: lazy `ssr:false`
   (`.atmosphere` gradient is the reserved fallback layer and the no-WebGL fallback), DPR
   capped, rAF paused when offscreen/hidden, reduced motion = one static painted frame.
   `three`/`@react-three` imports are **banned by design-lint** — pseudo-depth is drawn, not
   simulated.
3. **The legibility veil is the second sanctioned blur.** `.hero-veil` (scrim gradient +
   masked `backdrop-filter: blur`) is defined once in `globals.css` beside the nav glass —
   the only two blur devices; glassmorphism-as-decoration stays banned.
4. **The living graph becomes its own band — a canvas constellation.** A new full-bleed
   band directly south of the hero (`components/home/constellation-band.tsx`), sharing one
   wrapper with the hero so the ground + shader run continuously under both. The graph is a
   **custom Canvas-2D engine** (`components/art/constellation.tsx`, no new dependency):
   - **Deep nested model (~80 nodes, 3–4 levels):** the tessera hub at center; clusters
     repos → files → symbols, git history → commits, decisions → ADRs, memory → lessons,
     docs → pages; an agents ring (claude code, cursor, cline, codex); cross-links
     (ADR↔symbol, lesson↔file). Seeded deterministic layout.
   - **Pseudo-3D (2.5D), deliberately not real 3D:** per-node depth with perspective
     scaling, depth fog (far = smaller/dimmer/softer), pre-rendered glow sprites, and
     spring-smoothed pointer parallax tilting the constellation. Rationale: a 3D engine
     costs ~150KB+ against a 240KB budget, hurts battery and a11y, and ADR-0044 already
     rejected it; jurors reward the *feel*, which projection + fog + parallax deliver.
   - **Heavy randomized parallel traffic:** packets are glowing dots on multi-hop routes
     (leaf → parent → hub → agent; agent → hub → leaf queries), Poisson-randomized spawns,
     **20–40 concurrently alive**, varied speed/size; node hit-flash on arrival. Rose =
     served context, gold = the band's gilded moment (rare), clay = indexing.
   - **Interactive:** hover highlights a node's subtree (+ tooltip chip); **click toggles a
     node off** — it dims to an outline and traffic reroutes around it or fizzles; telemetry
     reacts. Node dragging is dropped (fights the depth projection).
   - **Decorative-interactive bundle** (memory: decorative-interactive-canvas-pattern):
     lazy `ssr:false` with height reserved, `aria-hidden` + sr-only alternative,
     keyboard-inert, page scroll always wins, telemetry simulated client-side and labeled
     "demo", reduced motion = static graph + zero packets + frozen counters. Colors resolved
     from CSS tokens at runtime (re-resolved on theme change) — tokens-only survives canvas.
   - v3's React Flow `LiveGraph` is **deleted**; `@xyflow/react` remains only in the
     `EffectWeb` miniature.
5. **Differentiator art rebuilt with constant-derived geometry.** `CompilerAssembly` v2
   (full column width, high-contrast tiles, disordered field → aligned mosaic + gilded
   arrival, found → ranked → kept funnel) and `GovernanceGate` v2 (equal lanes and one
   shared endpoint derived from constants — alignment by construction; the denied tile
   writes a visible audit-ledger row). Both play once in view; reduced motion = final frame.
6. **Typography discipline:** SVG `<text>` captions are eliminated site-wide — captions are
   HTML on the closed type scale. JetBrains Mono is restricted to eyebrow/label roles;
   numeric stats render in Manrope `tabular-nums`. `--text-display` retunes for the
   two-line hero (closed scale updated in doc + manifest, still seven names).
7. **Theme-true chapter bands.** `data-band='sand'` is renamed `data-band='chapter'` and
   re-tokenized per theme: **dark = elevated warm-dark band** (lifted espresso-plum ground,
   hairline seams — no more light sand in dark mode); light keeps the soft slate chapter.
   Pure token re-declaration; components stay tokens-only. The v2 "sand" palette retires.

MARKETING-DESIGN.md v4 + manifest 4.0.0 carry exact values; design-lint recompiles.

## Consequences

### Positive
- The hero statement is legible in every theme (veil), and the product story gets a whole
  band: a deep, breathing knowledge graph with visible heavy traffic — demonstration, not
  description.
- Zero new runtime dependencies: the shader and the constellation are hand-written (~16KB
  combined, both lazy). Deleting the React Flow hero graph removes its chunk from the hero
  path entirely.
- Dark mode is finally dark end-to-end; the chapter concept survives as elevation instead
  of a palette swap.

### Negative / Costs
- Two hand-written canvases to maintain (WebGL + Canvas-2D) instead of a library — offset
  by the design-lint confinement to `components/art/*` and the documented discipline bundle.
- WebGL adds a device-capability branch (context loss, no-WebGL fallback) that must be
  tested; the `.atmosphere` fallback keeps the page whole without it.
- The two-line h1 constrains future headline copy length (the clamp is tuned to this
  sentence pair).

### Neutral / Follow-ups
- ADR-0044's "WebGL deferred" stance is superseded *for the background field only* — with
  the dedicated performance plan it asked for (lazy, DPR cap, pause, fallback, budget gate).
- The pricing/features/enterprise pages (F-051 remainder) inherit v4 tokens unchanged.

## Amendment — v4.1 (2026-07-08, fifth stakeholder review, 31 directives)

Same review cycle; the deltas that supersede parts of the decision above:

1. **Hero veil is scrim-only** — the backdrop blur was frosting the shader; the veil
   now fades rightward *and* downward, and the constellation band gets a translucent
   `.graph-wash`, so hero → graph is one seamless space (no boundary). The "two blur
   devices" sanction returns to one (nav glass).
2. **Constellation camera is fixed** (three-quarter view: x/z ground plane + height
   jitter, constant pitch) — pointer tilt removed; the graph scales up; arrivals swell
   the node glow smoothly (the flash ring flickered); branching and nesting are
   **randomized per visit** within composed bounds; **agents carry live session
   sub-nodes** and traffic terminates in them; legends and the visual "demo" chip are
   removed (the sr-only alternative still discloses simulation — honesty preserved for
   assistive tech and reviewers); telemetry right-aligned; tooltip clamped to bounds.
3. **The mono voice is retired site-wide** — JetBrains Mono no longer loads; labels are
   tracked Manrope; no SVG `<text>` anywhere.
4. **React Flow is fully retired** — the effect web is rebuilt as pure SVG edges under
   HTML chips (more nodes, two dependency levels, truncation-safe, tokens-only);
   `@xyflow/react` leaves package.json.
5. **Shader reliability** — the effect initializes once (reduced-motion via live ref),
   paints every visible frame (resize + theme checked in the loop), and uses an
   alpha:true context so failure degrades to the atmosphere gradient instead of black.
6. **Chrome** — nav drops the redundant Sign in (both CTAs pointed at the same URL);
   the mobile menu gains the mosaic ground; "Deploy self-hosted" → "Self-host";
   **initial theme follows the system** (dark→dusk, light→noon, classless fallback =
   dusk), and the footer toggle propagates the change as a radial view transition from
   the control; the marquee carries agent brand marks (simple-icons, CC0, currentColor,
   wordmark fallback); illustration scenes may loop gently (breathing/cycling), always
   eased.

## Alternatives considered

- **three.js / react-three-fiber scene** — rejected: bundle (~150KB+ gz) vs. 240KB budget,
  battery/a11y costs, and the ban on 3D-engine decoration; 2.5D projection achieves the
  premium read. The design-lint ban makes this decision self-enforcing.
- **React Flow for the deep graph** — rejected: DOM nodes cannot animate 20–40 concurrent
  packets over 100+ edges at 60fps; the canvas engine can, with less code shipped.
- **Real 3D look via CSS 3D transforms** — rejected: per-node DOM transforms recreate the
  React Flow scaling problem and jitter under parallax.
- **Keeping the light sand chapter in dark mode** — rejected: explicit stakeholder veto;
  elevation replaces palette inversion.
- **Blur the whole graph behind the hero text (v3 layout kept)** — rejected: frosting half
  the viewport reads as glassmorphism; moving the graph south solves legibility *and* gives
  the graph room to be the masterpiece.

## References

ADR-0042 (enforcement mechanism), ADR-0043 (Terra Mosaic), ADR-0044 (v3 directives);
memory: decorative-interactive-canvas-pattern; plan `.harness/plans/F-051-marketing-site.md`
(v4 addendum); manifest `docs/design/marketing-design.manifest.json` v4.
