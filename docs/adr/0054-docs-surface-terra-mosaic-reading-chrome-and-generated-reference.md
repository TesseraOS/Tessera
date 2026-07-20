# ADR-0054: Docs surface — Terra Mosaic reading chrome, the fd seam, and the generated-reference pipeline

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Project lead (approach, quickstart honesty, theme catalog — confirmed 2026-07-20) + agent session
- **Tags:** frontend, docs, design, content, launch

## Context

ADR-0035 locked the docs stack (apps/docs, Fumadocs, docs subdomain) but left three
surface-level decisions to the implementing feature (F-053):

1. **Which design system** the docs wear — marketing's Terra Mosaic (dual themes) or the
   dashboard's four-theme catalog (ADR-0047). MARKETING-DESIGN.md's scope line already
   anticipated "the public chrome of `apps/docs`".
2. **How Fumadocs is themed** without forking it — fumadocs-ui styles itself through
   `--color-fd-*` CSS variables and offers slot props; anything deeper couples upgrades
   to design surgery.
3. **How reference content stays true** — FR-68 demands quickstart/concepts/reference/
   agent-guide/deployment docs, and the stakeholder set a hard "no fake data" bar with
   maximum verbosity. Hand-written reference pages drift from code by construction. The
   stakeholder's initial instinct was a single static JSON consumed site-wide.

Constraints in force: the golden honesty rules (nothing aspirational presented as
shipped: the CLI publishes on F-059, cloud deploys complete in F-056), NFR-17 (no
credentials, no third-party requests, SEO + performance budgets), ADR-0036 (llms.txt /
llms-full.txt), ADR-0046 (mascot's sanctioned docs adoption), and the recorded lesson
that this brand reads austerity as lifelessness.

## Decision

1. **The docs are the Terra Mosaic reading surface.** Dual themes (Desert Rose dusk
   default / Modern Minimalist noon) with the exact MARKETING-DESIGN §2 token values,
   tokens-only components, and the radial theme propagation (`startViewTransition` +
   clip-path circle from the pressed control, reduced-motion/unsupported ⇒ instant).
   The toggle lives in the docs chrome (header/sidebar footer) — a reading surface keeps
   it reachable, unlike marketing's footer placement. The dashboard's four-theme catalog
   was rejected with the stakeholder: it multiplies the review surface (8 combos × every
   docs page) and splits the public-facing brand.
2. **The mono voice returns on this surface.** Marketing retired mono (ADR-0045 v4.1)
   because captions posed as code; in documentation code IS content — Geist Mono joins
   Instrument Serif and Manrope. The retirement remains a marketing-page rule.
3. **Fumadocs is customized exclusively through the seam:** the `--color-fd-*` →
   Terra-Mosaic binding in `globals.css` (rose as the interactive voice; callout/diff
   semantics keep vendored functional colors — the emerald/red rule), the documented
   slot props (`themeSwitch`, nav), and `--fd-*` layout knobs. **No component forks.**
   Theme state itself lives in `lib/theme.tsx` alone, importing next-themes through
   `fumadocs-ui/provider/base` so the toggle shares RootProvider's exact context.
4. **Prose is authored, facts are generated.** MDX in `content/` carries the narrative;
   every machine-derivable fact renders from committed `generated/*.json` artifacts —
   `openapi.json` (from the SDK's captured spec), `mcp-tools.json` (from the real MCP
   registry), `cli-reference.json` (from the CLI's command table), `agent-clients.json`
   (from `MCP_CLIENTS` + the same renderer `tessera mcp-config` uses), and
   `env-reference.json` (from `.env.example`, whose completeness verify-state already
   guards). A drift test in the standard `test` gate regenerates and asserts
   byte-identity (the mascot brand-master pattern). This refines the stakeholder's
   static-JSON instinct: one referenced source of facts, but *derived*, never
   hand-maintained — and prose keeps the MDX toolchain (search, TOC, llms-full.txt).
5. **Honesty labels are structural:** the quickstart leads with the from-source path and
   marks the npx path as pending F-059; the deployment section ships Local + self-host
   (compose) and states that cloud pages land with F-056. Flipping these labels is part
   of those features' definitions of done.
6. **The contract is enforced, not hoped:** `docs/design/DOCS-DESIGN.md` +
   `docs-design.manifest.json` compile into `apps/docs/tests/design-lint.test.ts`
   (bans: raw hex, `dark:` variants, arbitrary color utilities, framer-motion, 3D
   engines, theme imports outside the seam, `transition-all`, hardcoded tessera domains,
   hype vocabulary; requires: the ripple mechanism, the reduced-motion kill-switch, the
   fd rose binding, `:focus-visible`). Axe WCAG AA e2e runs on both themes.

## Consequences

### Positive
- One public-surface brand across marketing and docs; the proven ripple/art/mascot
  patterns amortize a third time.
- Reference docs cannot silently lie: drift between code and docs is a red `test` gate,
  not a support ticket.
- Stock Fumadocs + the seam keeps upgrade cost near zero and inherits its a11y work.

### Negative / Costs
- Token values are duplicated from marketing's globals (vendored, not imported — apps
  don't share CSS files); E-022's drift stance covers the pairing.
- The generated artifacts must be regenerated when their sources change — deliberate
  friction, same as `packages/sdk/openapi.json` (the drift test names the command).
- fumadocs-ui v16 is young; staying stock limits exposure but pins us to its release
  cadence for fixes.

### Neutral / Follow-ups
- F-056 completes the deployment section (cloud pages); F-059 flips install paths to
  npm. The `/skills` page (F-054) lives on marketing, not here.
- Docs mascot/art placements land within F-053 under the §5 budget; the contrast gate
  (dashboard-style executable check) can adopt the docs token pairs if drift appears.

## Alternatives considered

- **Dashboard four-theme catalog on docs** — rejected (stakeholder-confirmed): review
  surface ×8, public brand split, and none of the dashboard's "operate your deployment"
  context applies to reading documentation.
- **Forking fumadocs-ui components for full brand control** — rejected: every upgrade
  becomes design surgery; the fd seam + slots deliver the brand without owning the
  component tree.
- **One hand-written static JSON for all docs data** (the original instinct) — refined
  into decision 4: hand-maintained JSON drifts exactly like prose, and prose-in-JSON
  loses search/TOC/MDX; generation from sources of truth keeps the "single referenced
  data source" virtue and adds a drift gate.
- **A docs CMS or hosted platform** — already rejected by ADR-0035 (drift from repo,
  external dependency).

## References

- [ADR-0035](0035-public-web-platform-three-surfaces.md) · [ADR-0036](0036-agent-first-operations.md)
  · [ADR-0044](0044-marketing-v3-dual-themes-illustration-first-live-graph.md) /
  [ADR-0045](0045-marketing-v4-constellation-shader-hero-theme-true-chapters.md) ·
  [ADR-0046](0046-brand-mascot-tess.md) · [ADR-0047](0047-dashboard-multi-theme-illustration-layer-contrast-gate.md)
- [`DOCS-DESIGN.md`](../design/DOCS-DESIGN.md) · [`docs-design.manifest.json`](../design/docs-design.manifest.json)
- Plan: [`.harness/plans/F-053-docs-site.md`](../../.harness/plans/F-053-docs-site.md)
- Fumadocs v16: <https://www.fumadocs.dev/blog/v16>
