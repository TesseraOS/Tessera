# Rule: Marketing site (`apps/marketing`)

Applies to `apps/marketing` (`@tessera/marketing`) — the public apex-domain surface
(ADR-0035). The general [frontend rule](frontend.md) applies where relevant, **but the
binding design authority for this app is
[`docs/design/MARKETING-DESIGN.md`](../../../docs/design/MARKETING-DESIGN.md)** (+ its
[manifest](../../../docs/design/marketing-design.manifest.json)) with the brand foundation
in [`docs/design/BRAND.md`](../../../docs/design/BRAND.md) — direction locked by
[ADR-0043](../../../docs/adr/0043-terra-mosaic-brand-and-marketing-overhaul.md) (mechanism:
[ADR-0042](../../../docs/adr/0042-marketing-site-design-direction.md)). On marketing pages
these win over the dashboard's DESIGN-SYSTEM.md.

## Hard constraints (gate-enforced where possible)

- **Start every UI task with the [`marketing-ui`](../../skills/marketing-ui/SKILL.md)
  skill.** Do not compose pages from memory of "what marketing sites look like."
- **Tokens only; closed type scale; accent budget.** The design-lint suite
  (`apps/marketing/tests/design-lint.test.ts`) compiles the manifest's banned/required
  patterns and runs in the standard `test` gate — a violation is a build failure, not a
  style comment. Never weaken a pattern or add an `allowIn` exemption to make a build pass;
  that edit is a design decision and needs the manifest + doc updated together (and review).
- **Static-first (NFR-17):** every route statically generated; **no authenticated API
  calls; no credentials; no cookies; no third-party requests** (fonts self-hosted, no
  analytics scripts, no iframes). Client islands are limited to the manifest's list
  (nav toggle, copy buttons).
- **Section archetypes only** (MARKETING-DESIGN §3): pages compose the fixed inventory
  (nav, hero, proof-strip, feature-row, steps, code-block, pricing-table, faq, cta-band,
  footer). A new archetype = doc + manifest update first.
- **Honest content:** no fabricated logos/testimonials/ratings/counts/metrics. Pricing
  renders from `@tessera/billing` PLANS — never hand-copied numbers. Integrations are
  typographic wordmarks.
- **No hardcoded domains:** cross-surface URLs via `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_SITE_URL` (TLD undecided).
- **No dashboard imports:** the package-boundary lint stays intact; shared code is limited
  to ports/packages explicitly published for it (e.g. `@tessera/billing` for PLANS). The
  logo mark is *ported* (copied) per MARKETING-DESIGN §4, not imported across apps.

## SEO / a11y / performance (acceptance-level)

- Per-page `metadata` (design-lint requires the export), OG image, `sitemap.ts`,
  `robots.ts`, `llms.txt` (ADR-0036).
- axe WCAG 2.1 AA in e2e with zero violations; one `h1` per page; no horizontal overflow
  at 375px; full keyboard paths (incl. mobile nav).
- First-load JS ≤ 240KB gzip per page (framework baseline ~185KB — the cap is on app
  code + motion; Lighthouse CWV enforcement lands with F-049); motion via the
  **`lib/motion.tsx` seam only**
  (LazyMotion + MotionConfig — importing framer-motion anywhere else fails design-lint);
  LCP element never animated from invisible; reduced-motion = complete stillness.

## Definition of done for any marketing screen

Gates green **plus** the MARKETING-DESIGN §8 review protocol: design-lint, axe e2e, and
**screenshot review** (1440/1280/375, full-page, reduced-motion) against the checklist —
including the brand-swap test. "It renders" is not "it's right."
