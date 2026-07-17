# Plan: F-083 The dashboard still ships brand mark v1 — adopt v2 everywhere via a shared package

- **Feature:** F-083 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-14
- **Service / package:** `@tessera/brand` (new) → `apps/web`, `apps/marketing`
- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-17

## Intent

User item 15: *"Fix logo, use the logo that we developed in marketing site. It's our logo to be used
everywhere. So fix the logo globally everywhere in dashboard."*

Done means: one mark, defined once, rendered identically in both apps — and the dashboard stops
shipping a different logo from the brand.

## The divergence, verified (not a preference — the dashboard is simply wrong)

[`BRAND.md §4`](../../docs/design/BRAND.md) is authoritative, and the master
[`tessera-mark.svg`](../../docs/design/brand/tessera-mark.svg) is the canonical artwork: a 3×3 mosaic
of ivory tiles, top-right tile **lifted out and gilded in the ember gradient** (`#E2A3A8` → `#E4B65A`),
wordmark `tessera` in **Instrument Serif lowercase**. Monochrome fallback is explicitly sanctioned.

- `apps/marketing/components/logo.tsx` (now deleted) — **mark v2**, a
  faithful port (same 112 viewBox + geometry), ember on `--rose`/`--gold`, serif lowercase wordmark.
- `apps/web/components/logo.tsx` (now deleted) — **mark v1**: a monochrome
  *pixel* mark ("scattered tesserae converge into a solid core"), 32 viewBox, different geometry.
- The dashboard's wordmark is **"Tessera", capitalised, sans, semibold**
  ([`app-sidebar.tsx:30`](../../apps/web/components/app-sidebar.tsx)) — off-brand twice over.
- The dashboard has **no favicon at all**; marketing has `app/icon.tsx`.

**Root cause is duplication.** Two hand-maintained copies of a brand asset drift the moment one is
updated — which is exactly what happened when v2 landed on marketing. Fixing only the pixels leaves
the cause in place, so this extracts to one shared package. `@tessera/mascot` is the in-repo
precedent for a shared brand asset consumed by both apps: follow it rather than invent.

## Approach — a closed contract, and a fallback that cannot be off-brand

`@tessera/mascot`'s design solves the exact risk this feature carries. Its `styles.css` states it:
*"Every value falls back to currentColor, so an unbound app renders a monochrome Tess — never
off-brand color."* The mark takes the same shape:

1. **`@tessera/brand`** (new package, mirroring `packages/mascot`) owns `LogoIcon` + `Logo`, ported
   **from the master SVG**, geometry unchanged from marketing's v2 (so marketing is byte-equivalent
   in output and its own render is a regression test).
2. **Closed theming contract**, every value falling back safely:
   - `--brand-ember-from` / `--brand-ember-to` → fall back to `currentColor`. An unbound app renders
     a **monochrome** mark, which is BRAND.md's sanctioned fallback — *not* an invisible tile. This
     is the whole answer to "the gradient resolves to transparent in 3 of 8 theme combinations".
   - `--brand-wordmark-font` → falls back to `ui-serif, serif`.
3. **Bindings.**
   - `marketing`: ember → `var(--rose)`/`var(--gold)`, wordmark → Instrument Serif. **Zero visual
     change** — it already renders exactly this.
   - `web`: ember bound **per mode, not per theme**. BRAND.md forbids recoloring the mark outside the
     palette, so unlike the mascot (which ADR-0047 *explicitly* licensed to take each theme's warm
     accent) the mark stays brand-constant across all four themes. Mode-appropriate variants, the
     same two the brand already uses: dark → `#E2A3A8`/`#E4B65A` (the master values), light →
     `#9E4A56`/`#8A6A24`.
   - `web` gains **Instrument Serif** via `next/font` as a dedicated `--font-brand` — deliberately
     *not* a theme face, so ADR-0047's per-theme font system is untouched.
4. **Adopt everywhere in the dashboard:** sidebar (mark + the sans "Tessera" span it hand-rolls),
   signin, and a new `app/icon.tsx` favicon.

## Files to touch

- `packages/brand/{package.json,tsconfig.json,tsconfig.typecheck.json,README.md}` + `src/{index.ts,logo.tsx,logo.test.tsx}`.
- `apps/web/package.json`, `apps/marketing/package.json` — take the dependency.
- `apps/web/components/logo.tsx`, `apps/marketing/components/logo.tsx` — **deleted**; imports repointed at `@tessera/brand`.
- `apps/web/app/globals.css`, `apps/marketing/app/globals.css` — bind the contract.
- `apps/web/app/layout.tsx` — `--font-brand`; `apps/web/app/icon.tsx` — new.
- `apps/web/components/app-sidebar.tsx`, `apps/web/app/signin/page.tsx`.
- `docs/design/DESIGN-SYSTEM.md` §0 — the Logo line pointed at `apps/web/components/logo.tsx`, which
  ceases to exist; it now points at the package.

## Anticipated effects

- **E-004 (design tokens / DESIGN-SYSTEM)** — a new closed token contract joins the theme layer, and
  §0's Logo pointer must move or the doc lies. Same class of edit as F-080's §11 budget.
- **No API/runtime contract change**; presentation only.
- New workspace package ⇒ turbo build graph + both apps' dependency lists. Build order matters:
  `@tessera/brand` must build before either app.
- Marketing is the **regression surface**: it renders v2 today, so any pixel change there means the
  port is wrong.

## Test plan

- **Unit (`packages/brand`):** the mark renders the 9 tiles + the lifted ember tile; `emberId`
  isolates gradient ids so two marks on one page cannot collide (marketing's existing prop —
  preserve it); unbound ember falls back to `currentColor` (the monochrome guarantee).
- **Regression:** marketing's existing suites + `apps/web` suites stay green untouched.
- **Visual:** screenshot the dashboard sidebar + signin across all 4 themes × light/dark — the
  binding claim is exactly the kind that must be seen, not asserted.
- **a11y/contrast:** the mark is a logotype (no WCAG contrast requirement), and instances are
  `aria-hidden` with text as the carrier — confirm the contrast gate's registered pairings are
  unaffected rather than assuming.

## Verification

Gates: `state`, `typecheck`, `lint`, `format`, `test`, `build`. Plus screenshots per the frontend
quality bar.

## Risks / open questions

- **The ember tokens are the whole risk**, and the `currentColor` fallback retires it: worst case is
  a monochrome mark that BRAND.md already allows, never an invisible tile.
- **Scope honesty:** the sidebar's hand-rolled `<span>Tessera</span>` is part of "the logo" — the
  lockup is mark + wordmark. Changing it to lowercase serif `tessera` is the brand's rule, not a
  preference, but it *is* a visible change to a surface the user did not name explicitly. Flag it in
  the report rather than let it be a surprise.
- Adding a font to the dashboard has a real cost; one weight, self-hosted, subset by `next/font`, and
  used by exactly one string. If that proves objectionable, the fallback (`ui-serif`) is sanctioned.
- **Not in scope:** the `Context & Memory OS` badge removals (F-080 hero — done; F-082 signin).
