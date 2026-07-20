# AGENTS.md — apps/docs (Tessera documentation site)

> **Scope:** the public documentation site (`@tessera/docs`, docs subdomain — ADR-0035).
> **Extends the root harness — read [`../../AGENTS.md`](../../AGENTS.md) first.** Everything
> global applies unchanged; this file only **adds** docs specifics and never relaxes a
> global rule.

`extends: root`

## What this service is

Tessera's manual: quickstart, concepts, how-to guides, per-agent MCP setup, generated
REST/MCP/CLI/config references, deployment guides — **versioned with the code** (Fumadocs,
ADR-0035) and agent-readable (`llms.txt` / `llms-full.txt`, ADR-0036). It is **not** an
app: no authenticated API calls, no credentials, no cookies, no third-party requests
(NFR-17). Search is a local Orama index.

## The binding design authority (read this before any UI edit)

**[`docs/design/DOCS-DESIGN.md`](../../docs/design/DOCS-DESIGN.md)** — the Terra Mosaic
reading surface: dual themes (dusk default / noon), tokens-only, the `--fd-*` binding
seam, type ramp, art & mascot budget, motion rules — locked by ADR-0054. Its
machine-readable projection, [`docs-design.manifest.json`](../../docs/design/docs-design.manifest.json),
is compiled into hard failures by [`tests/design-lint.test.ts`](tests/design-lint.test.ts)
(runs in the standard `test` gate). If design-lint fails: **fix the code, never the
pattern.**

## Service rules (in addition to root)

- **Prose is authored, facts are generated.** Reference data (OpenAPI, MCP tools, CLI,
  agent client snippets, env vars) renders from [`generated/`](generated/) — produced by
  `pnpm --filter @tessera/docs generate` from the sources of truth, committed, and
  drift-gated by a test. Never hand-edit `generated/`; never hand-copy a fact it covers
  into MDX.
- **Honest content only.** Nothing aspirational presented as shipped: the CLI's npm
  install path is labeled until F-059 publishes; cloud deployment pages land with F-056.
  Claims trace to PRD/architecture/ADRs or to code.
- **Stock Fumadocs components** — customization happens through the CSS-variable seam
  (`--fd-*` ← Terra Mosaic tokens), not forks, so upgrades stay cheap.
- **No hardcoded domains** — [`lib/site.ts`](lib/site.ts) reads `NEXT_PUBLIC_DOCS_URL` /
  `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` (see [.env.example](.env.example)).
- **No dashboard/marketing imports** (package-boundary lint); shared visuals come from
  `@tessera/mascot` / `@tessera/brand` or are ported, never cross-app imported.
- Definition of done for a screen = gates green **+ DOCS-DESIGN review**: design-lint,
  axe AA e2e on both themes, screenshot review (1440/1280/375 + reduced-motion).

## Relevant features

**F-053** (this site — plan: [`.harness/plans/F-053-docs-site.md`](../../.harness/plans/F-053-docs-site.md));
cloud deployment pages complete in **F-056**; npm install paths flip with **F-059**.
