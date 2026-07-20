# Plan: F-053 Docs site (`apps/docs`, Fumadocs) on the docs subdomain

- **Feature:** F-053 (link: [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-68 (docs site: quickstart, concepts, generated API reference,
  per-agent MCP setup guides, deployment guides), NFR-17 (public-web quality: SEO +
  CWV budgets, no credentials, never calls the authenticated API)
- **Service / package:** `apps/docs`, `@tessera/docs`
- **Author:** agent session · **Date:** 2026-07-20

## Intent

The third public surface (ADR-0035): `docs.tessera.<tld>` — an enterprise-grade
documentation site built with **Fumadocs v16** (Next 16, Tailwind v4 — matching the
workspace), versioned with the code, with built-in search, a generated API reference,
per-agent MCP setup guides, and Local + self-host deployment guides. "Done" for a user:
they can go from zero → running Local deployment → agent connected → first
`compile_context`, entirely from the docs, with every fact on the site true of the code
at that commit.

## Approach

### A. Stack & scaffold

- `apps/docs` = Next.js 16 App Router + `fumadocs-ui` / `fumadocs-core` /
  `fumadocs-mdx` (v16 line; requires Next ≥16, React ≥19.2 — we ship Next ^16.2, React
  ^19.2 already) + `fumadocs-openapi` (v9.6 line) for the API reference. Tailwind v4
  via `@tailwindcss/postcss` like the other two web apps. Dev port **3003**.
- Service-scoped `AGENTS.md` (extends root, mirrors `apps/marketing/AGENTS.md` shape).
- Search: Fumadocs' built-in Orama search (local index, no cloud, no third-party
  request — NFR-17 posture preserved), ⌘K dialog.

### B. Design — Terra Mosaic reading surface (new ADR)

MARKETING-DESIGN.md v4 already declares its scope extends to "the public chrome of
`apps/docs`". Decision to record as **ADR-0054**:

- **Two themes, one token architecture** — dark **Desert Rose dusk** (default) / light
  **Modern Minimalist noon**, the exact §2 token values, `next-themes` with the `.light`
  class, tokens-only components.
- **Radial theme propagation** — port marketing's `useThemeTransition`
  (`startViewTransition` + clip-path circle from the pressed control; instant under
  reduced-motion/unsupported). Toggle in the docs header (a reading surface needs it
  reachable, unlike marketing's footer placement — recorded in the ADR).
- **Fumadocs binding**: map Fumadocs' `--fd-*` / `--color-fd-*` CSS variables onto the
  Terra Mosaic tokens in `app/globals.css` — one binding block per theme; Fumadocs
  components stay stock (no forks), so upgrades stay cheap.
- **Type**: Instrument Serif (display voice, docs headings h1/h2) + Manrope (UI/body)
  via `next/font`; **mono returns on this surface** (code is *content* here, not
  decoration — Geist Mono, already in the workspace) — the marketing "mono retired"
  rule is a marketing-page rule, scoped in the ADR.
- **Docs design contract**: `docs/design/DOCS-DESIGN.md` + `docs-design.manifest.json`
  compiled into `apps/docs/tests/design-lint.test.ts` (the proven F-051/F-070
  mechanism): tokens-only, banned imports (`three`, raw framer outside a seam — docs
  aims for **zero framer**: CSS-only motion), accent budget, honest-content rules,
  art/mascot usage budget.
- **Art & mascot**: the marketing art idiom (server-rendered token-driven SVG, CSS-only
  infinite ambient motion, reduced-motion ⇒ stillness, `aria-hidden` + text sibling).
  Budgeted placements: docs-home hero art, section-index cards, 404 (Tess `lost`),
  search-empty (Tess `searching`), docs-home greeting (Tess `curious`/`greeting`).
  `@tessera/mascot` docs adoption is the ADR-0046 sanctioned follow-up: bind the closed
  `--mascot-*` contract to docs tokens per theme (E-023 gains a consumer).
- Micro-interactions (CSS-only): copy-button feedback, card hover lift/ember accents,
  active-TOC glow, breadcrumb/pager transitions — all interruptible, token-driven.

### C. Content architecture — MDX prose + **generated** reference data

Refines the stakeholder's "static JSON file" idea. Hand-written JSON would drift and
can't feed search/TOC/headings. Instead, two lanes with one rule — *prose is authored,
facts are generated*:

1. **Prose = MDX** in `apps/docs/content/` (Fumadocs source; versioned with the code;
   indexed by search; "docs change with the feature" stays real).
2. **Facts = generated JSON** in `apps/docs/generated/` — never hand-edited, each file
   derived from the single source of truth it documents:
   - `openapi.json` — copied from `packages/sdk/openapi.json` (itself captured from the
     real Fastify app by `sdk generate`); feeds `fumadocs-openapi`.
   - `mcp-tools.json` — from the real MCP server registry (`apps/mcp`): 18 tools,
     names/descriptions/input schemas.
   - `cli-reference.json` — from `apps/cli`'s command/flag definitions.
   - `agent-clients.json` — from `apps/cli/src/mcp-clients.ts` (`MCP_CLIENTS` +
     `renderMcpClientConfig`) → the per-agent setup pages render the *same* snippets
     `tessera mcp-config` prints.
   - `env-reference.json` — parsed from `.env.example` (verify-state already guards its
     completeness, so it is the config source of truth).
   - A **drift gate**: `pnpm --filter @tessera/docs generate` + a test asserting
     regeneration is byte-identical (the mascot brand-master pattern). Stale docs data
     = red `test` gate. This makes "no fake data" mechanical, not aspirational.

### D. Information architecture (~35 pages, verbose by design)

- **Docs home** — hero + quick paths + section index (signature art, Tess).
- **Quickstart** — from-source path (the CLI is not yet on npm — F-059; the npx form is
  shown but explicitly labeled), `init` → `source add` → `mcp-config` → agent connected
  → first `search`/`compile_context`.
- **Concepts** — what-is-tessera, architecture (modular monolith, ports & adapters),
  context-compiler (retrieve→rank→compress→cite, budgets), effect-links, memory,
  knowledge-graph, retrieval (hybrid + fusion), provenance & citations, tenancy &
  projects, glossary. Rewritten for users from PRD/ARCHITECTURE/ADRs — never pasted.
- **Guides** — sources (add/scan/manage, git vs filesystem), tokens & auth (RBAC,
  scopes), tenants & projects, governance & audit, search & compile in practice
  (budgets, `explain`), capturing memory, backup & restore.
- **Agents** — overview + per-agent pages: Claude Code, Cursor, Cline, Codex CLI,
  Continue — copy-paste config from `agent-clients.json`.
- **Reference** — REST API (`fumadocs-openapi` from the real `/v1` spec), MCP tools
  (18, from `mcp-tools.json`), CLI (from `cli-reference.json`), configuration
  (`tessera.config.json` + every `TESSERA_*` env var from `env-reference.json`).
- **Deployment** — overview, Local (file-backed SQLite profile), self-host Docker
  (the real `docker-compose.yml`: pgvector Postgres + server-from-source, health
  checks, upgrade/backup notes); cloud pages land with F-056 (section notes this
  honestly — no placeholder fabrication).

### E. Agent-readability & SEO (NFR-17, ADR-0036)

- `llms.txt` (index) + `llms-full.txt` (full content dump from the Fumadocs source) as
  route handlers, `force-static`.
- Metadata + OG images, `sitemap.ts`, `robots.ts`; no cookies, no third-party
  requests, zero client data fetching; the one localStorage entry is the theme.

## Files to touch

- `apps/docs/**` — the new app (package.json, next/tailwind/ts/eslint config, `app/`,
  `content/`, `components/`, `lib/theme.tsx`, `generated/`, `scripts/generate.mjs`,
  `tests/` incl. Playwright + axe + design-lint + drift + link-check, `AGENTS.md`).
- `docs/design/DOCS-DESIGN.md` + `docs/design/docs-design.manifest.json` — new contract.
- `docs/adr/0054-docs-surface-terra-mosaic-reading-chrome-and-generated-reference.md`.
- `tests/web-perf/budgets.json` — register `docs` (own first-load budget, public:true).
- `.harness/state/effects.json` — E-004, E-023 gain docs; new coupling rows (openapi
  artifact → docs, MCP_CLIENTS → docs, .env.example → docs) per effect-trace.
- Root `README.md` — docs app row; `.claude/launch.json` — docs dev server entry.
- CI mirror only if a new gate step is needed (link-check runs inside `test`).

## Anticipated effects

- **Consumes** (adds dependents to): `packages/sdk/openapi.json` (SDK generate
  artifact), `apps/cli` MCP_CLIENTS table + command surface, `.env.example`,
  `@tessera/mascot` `--mascot-*` contract (E-023), Terra Mosaic token values (E-022 —
  docs *copies* the token architecture per ADR; the drift stance is recorded there),
  `docker-compose.yml`.
- **Changes no shared contract** — pure consumer; existing apps untouched except the
  web-perf budget registry (additive row).

## Test plan

- **Unit/design (vitest):** design-lint from the manifest; generated-data drift test;
  internal link-check across all MDX (every `/docs`-internal href resolves to a page or
  anchor); content honesty checks (e.g. agent pages render from `agent-clients.json`).
- **E2E (Playwright, own dev server, port family like marketing):** nav + search
  journey, theme ripple lands (`data-theme`/class flips), reference pages render the
  generated data, llms.txt/llms-full.txt respond, 404 mascot, **axe WCAG AA on both
  themes** across representative pages.
- **web-perf:** docs entry in `tests/web-perf/budgets.json` (measured then locked, the
  F-049 method).

## Verification

Ordered gates with evidence per the protocol: `state` → `typecheck` → `lint` → `format`
→ `test` → `build` → `e2e` → `web-perf`. `e2e-full`/`perf` unaffected (no engine
change) but must stay green at the final workspace run.

## Risks / open questions

- **OQ1 (quickstart honesty):** `@tessera/cli` is unpublished until F-059 — the
  quickstart leads with the from-source path and labels the npx form as
  publish-pending. Confirmed direction needed from stakeholder (default: as stated).
- **OQ2 (theme catalog):** Terra Mosaic dual themes (per MARKETING-DESIGN scope), not
  the dashboard's four-theme catalog — ADR-0054 records it. Stakeholder confirm.
- **Fumadocs v16 is young** — sidebar API removed, provider import moved; we stay on
  stock components + CSS-variable binding to keep the upgrade surface minimal.
- **fumadocs-openapi bundle weight** on reference pages — code-split by construction
  (only reference routes import it); web-perf measures the docs home, and the budget
  is set from measurement.
- **Windows** — generation scripts use Node APIs (no shell-isms), like `sdk generate`.
