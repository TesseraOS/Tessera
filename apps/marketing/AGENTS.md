# AGENTS.md — apps/marketing (Tessera marketing site)

> **Scope:** the public marketing site (`@tessera/marketing`, apex domain — ADR-0035).
> **Extends the root harness — read [`../../AGENTS.md`](../../AGENTS.md) first.** Everything
> global applies unchanged; this file only **adds** marketing specifics and never relaxes a
> global rule.

`extends: root`

## What this service is

Tessera's first impression: positioning, features, pricing, trust — static-first, SEO-clean,
agent-readable (`llms.txt`). It sells the three differentiators (Context Compiler,
effect-links, governance) beyond the unabyss.com reference. It is **not** an app: no
authenticated API calls, no credentials, no cookies, no third-party requests (NFR-17).

## The binding design authority (read this before any UI edit)

**[`docs/design/MARKETING-DESIGN.md`](../../docs/design/MARKETING-DESIGN.md)** — direction,
exact tokens, the closed type scale, section archetypes, accent budget, voice, review
protocol — locked by [ADR-0042](../../docs/adr/0042-marketing-site-design-direction.md).
The dashboard's DESIGN-SYSTEM.md does **not** govern this app.

Its machine-readable projection,
[`marketing-design.manifest.json`](../../docs/design/marketing-design.manifest.json), is
**compiled into hard failures** by [`tests/design-lint.test.ts`](tests/design-lint.test.ts)
(runs in the standard `test` gate). If design-lint fails: **fix the code, never the
pattern.** Pattern/allowIn edits are design decisions — doc + manifest together, reviewed.

## Service rules (in addition to root)

- Rule file: [`.harness/rules/frontend/marketing.md`](../../.harness/rules/frontend/marketing.md).
- **Start any UI work with the [`marketing-ui`](../../.harness/skills/marketing-ui/SKILL.md)
  skill** (not `build-ui` — that is the dashboard's).
- Compose pages **only** from the §3 section archetypes and §4 component set. A new shape =
  update MARKETING-DESIGN.md + manifest first.
- **Honest content:** nothing fabricated; pricing from `@tessera/billing` PLANS; integrations
  as typographic wordmarks; claims trace to PRD/architecture.
- **No hardcoded domains** — `lib/site.ts` reads `NEXT_PUBLIC_SITE_URL` /
  `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_DOCS_URL` (see [.env.example](.env.example)).
- **No dashboard imports** (package-boundary lint); the logo mark is ported, not shared.
- Definition of done for a screen = gates green **+ MARKETING-DESIGN §8**: design-lint,
  axe AA e2e, screenshot review (1440/1280/375 + reduced-motion), brand-swap test.

## Relevant features

**F-051** (this site — plan: [`.harness/plans/F-051-marketing-site.md`](../../.harness/plans/F-051-marketing-site.md)),
then **F-054** (`/skills` registry page). Pricing must render from the F-030 PLANS catalog.
