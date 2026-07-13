---
name: contrast-checker
description: Verify and fix WCAG AA contrast (>= 4.5:1 body text, >= 3:1 large text / non-text UI) across every theme x mode of a Tessera web app. Operationalizes .harness/rules/frontend/contrast.md and DESIGN-SYSTEM 8.1.
---

# Skill: contrast-checker

Use when: adding/changing **color tokens or themes**, introducing a **new text/background
token pairing**, reviewing a screen where text sits on a tinted surface or illustration,
or a contrast test fails.

> Rule: [`.harness/rules/frontend/contrast.md`](../../rules/frontend/contrast.md) ·
> Authority: [ADR-0047](../../../docs/adr/0047-dashboard-multi-theme-illustration-layer-contrast-gate.md),
> [DESIGN-SYSTEM.md §8.1](../../../docs/design/DESIGN-SYSTEM.md).

## Thresholds (WCAG 2.1 AA)

| Content | Minimum ratio |
|---------|---------------|
| Normal text (< 24px / < 18.66px bold) | **4.5:1** |
| Large text (≥ 24px, or ≥ 18.66px bold) | **3:1** |
| Focus ring on its surfaces (hard-gated) | **3:1** |
| Components identified **only** by a border (judgment check in design review) | **3:1** |

Ratio = `(L1 + 0.05) / (L2 + 0.05)` over WCAG relative luminance of the **composited**
sRGB colors (alpha values must be blended over their actual backdrop first).

## Workflow

1. **Run the executable checker** (dashboard):
   `pnpm --filter @tessera/web test -- contrast`
   It parses the theme CSS (`globals.css` + `themes.css`), resolves every registered token
   pairing in **all 4 themes × 2 modes**, and fails on any miss with the computed ratio.
2. **When a pairing fails — fix the token, never the check:**
   - Find the failing side that costs the theme's character least (usually the
     foreground). Apply the **smallest oklch lightness step** that passes (in oklch, move
     `L` toward the extreme; ~0.02–0.05 usually buys a whole ratio point near mid-tones).
   - Re-run the checker; iterate. Leave a CSS comment: `/* L nudged 0.52→0.47 for AA */`.
   - If a theme value came vendored (tweakcn) this is expected — vendored values are ours
     once nudged (ADR-0047).
3. **When you introduce a new pairing** (a token used as text on a surface it wasn't
   before): add it to the pair registry in `apps/web/tests/contrast.test.ts` **in the same
   change**. Unregistered pairs are unprotected.
4. **Verify what tokens can't prove.** The checker covers token pairs; axe (e2e gate)
   covers the rendered DOM per route; **screenshots** cover judgment cases — text over
   illustrations, gradients, or images. During design-review, spot-check those by eye and
   with the browser (zoom on the region; if in doubt, sample the two colors and compute).
5. **Never** "fix" contrast by hardcoding a one-off color in a component (token rule), by
   shrinking the registry, or by branching on theme in components.

## Quick math reference

- Relative luminance: linearize each sRGB channel
  (`c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`), then
  `L = 0.2126R + 0.7152G + 0.0722B`.
- oklch → sRGB needs the OKLab → LMS → linear-sRGB matrix chain — the dashboard's checker
  implements it dependency-free (`apps/web/tests/contrast.test.ts`); reuse it, don't
  re-derive.
- Rules of thumb: white text needs backgrounds darker than ≈ `oklch(0.62 …)`; black text
  needs lighter than ≈ `oklch(0.75 …)`; a 4.5:1 pair survives both directions of a
  0.02 L wobble.
