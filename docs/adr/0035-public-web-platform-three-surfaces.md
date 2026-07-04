# ADR-0035: Public web platform — three surfaces on three subdomains (marketing, app, docs)

- **Status:** Accepted
- **Date:** 2026-07-04
- **Deciders:** Project lead + supervising architect session
- **Tags:** frontend, platform, deployment, docs, launch

## Context

Tessera has one web surface today: the dashboard (`apps/web`), built for operating a
deployment. Launching the product requires two more public surfaces the PRD did not yet
specify:

1. a **marketing site** that positions and sells the product (reference point:
   [unabyss.com](https://unabyss.com) — "context headquarter" positioning, integrations
   wall, pricing, a `/skills` library — which Tessera intends to exceed in depth:
   compiler + effect-links + governance are differentiators unabyss does not have);
2. a **documentation site** with quickstarts, concepts, generated API reference, agent
   setup guides, and **deployment guides** (self-hosted + managed cloud).

These have different audiences, different rendering profiles (static/SEO-heavy vs.
authenticated app), different release cadences, and different security postures
(the marketing/docs surfaces must never require or hold credentials). Bundling them into
`apps/web` would couple SEO-critical static pages to an authenticated SPA shell, bloat
the dashboard bundle, and make access separation (NFR-1) harder.

## Decision

We will run **three web properties, three apps, three (sub)domains**, all in the
monorepo, all bound by `docs/design/DESIGN-SYSTEM.md`:

| Surface | App | Domain | Stack |
|---------|-----|--------|-------|
| Marketing | `apps/marketing` (`@tessera/marketing`) | apex — `tessera.<tld>` | Next.js (App Router), static-first, SEO/OG/sitemap |
| Dashboard | `apps/web` (existing `@tessera/web`) | `app.tessera.<tld>` | unchanged (Next.js) |
| Docs | `apps/docs` (`@tessera/docs`) | `docs.tessera.<tld>` | Next.js + **Fumadocs** (MDX) |

Parameters:

- **Docs toolchain: Fumadocs.** Next-native (same stack, same tokens, same deploy
  target), MDX content, built-in search, OpenAPI page generation from the `/v1` spec
  (the SDK generate script already captures `openapi.json`). Docs are **versioned with
  the repo** — the docs gate is "docs change with the feature," not a separate CMS.
- **API origin:** the hosted API lives at `api.tessera.<tld>`; the dashboard calls it
  cross-origin with a **per-profile CORS allowlist** (local default stays permissive
  loopback). Marketing/docs never call the authenticated API.
- **Shared design language:** the OKLCH token set from DESIGN-SYSTEM.md is the single
  source; the implementing feature extracts a shared Tailwind preset/token package if
  duplication appears (implementation detail, not decided here).
- **Public-surface quality bar:** Core Web Vitals budgets + SEO metadata (sitemap,
  robots, OG images) are acceptance criteria (NFR-17), enforced by the `web-perf` gate
  as it activates.
- **Agent-readability:** marketing and docs serve `llms.txt` / `llms-full.txt` and the
  skills index (ADR-0036) so agents can consume the public surface without scraping.

## Consequences

### Positive
- Clean separation of audiences, bundles, cadence, and security posture; the dashboard
  stays an app, the public surfaces stay static-fast and SEO-clean.
- Same Next.js + tokens everywhere — one design system, one deploy story, shared CI.
- Docs live next to code → the "docs updated" definition-of-done item becomes real.

### Negative / Costs
- Two more apps in the workspace (build time, dependency surface, more e2e).
- Cross-origin app↔api requires deliberate CORS + auth-header handling (covered by the
  dashboard-auth and hardening features).

### Neutral / Follow-ups
- Realized by features **F-051 (marketing)**, **F-052 (docs)**, **F-053 (skills page)**,
  with deployment artifacts in **F-056**; hosting provider choice (Vercel vs. Node
  containers behind the same CD) is left to F-056 — both are supported by this shape.
- Each new app gets a service-scoped `AGENTS.md` extending root (harness §4).

## Alternatives considered

- **One Next.js app with route groups** — rejected: couples marketing SEO and docs to
  the authenticated shell; one bundle, one cadence, weaker isolation.
- **Hosted docs platform (Mintlify/GitBook)** — rejected: external dependency, drift
  from repo, weaker open-core story; Fumadocs keeps docs in-repo and free.
- **Docusaurus/Astro Starlight for docs** — rejected: second frontend stack to maintain;
  Fumadocs reuses the existing Next/Tailwind/shadcn competence and tokens.

## References

- Related: ADR-0009 (frontend stack), ADR-0021 (frontend harness), ADR-0023 (dashboard
  design reference), ADR-0036 (agent-first operations), PRD §6.10 (FR-67/68/69),
  NFR-17; `docs/design/DESIGN-SYSTEM.md`.
