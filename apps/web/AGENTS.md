# AGENTS.md — apps/web (Tessera dashboard)

> **Scope:** the Next.js dashboard (`@tessera/web`). **Extends the root harness — read
> [`../../AGENTS.md`](../../AGENTS.md) first.** Everything global applies unchanged; this
> file only **adds** frontend specifics and never relaxes a global rule.

`extends: root`

## What this service is
The operator/developer UI: global search, knowledge-graph & architecture visualization,
timelines, the **Context Package inspector** (the "why" debugger), memory/ADR authoring,
configuration, and (later) governance/analytics. It talks only to `@tessera/api` via the
generated SDK. See [`../../docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md).

## Service rules (in addition to root)
- Frontend rules: [`.harness/rules/frontend.md`](.harness/rules/frontend.md) and the global
  [`frontend`](../../.harness/rules/frontend/frontend.md) rule.
- **No business logic in the UI** — call the API; the dashboard renders and explains.
- **Provenance-first**: any surface showing context must show sources/scores/"why included."
- **UX baseline is mandatory** (PRD FR-49): loading/empty/error states, ⌘K, themes,
  optimistic updates, virtualization, toasts.
- **Accessibility is a gate** (NFR-9, WCAG 2.1 AA): semantic HTML, keyboard paths, focus,
  contrast. Contrast is **executable** — rule
  [`contrast.md`](../../.harness/rules/frontend/contrast.md) + skill
  [`contrast-checker`](../../.harness/skills/contrast-checker/SKILL.md); token changes must
  keep `tests/contrast.test.ts` green across all 4 themes × 2 modes (ADR-0047).
- **Theming** (DESIGN-SYSTEM §0.1, ADR-0047): mode = `.dark` class (next-themes) × theme =
  `data-theme` (`monkai` default / `amber` / `claude` / `notebook`). Components are
  token-only and never branch on either; theme tokens live in `app/themes.css` (vendored —
  never `shadcn add` over `:root`); appearance switches ripple via `lib/theme.tsx`.
- **Illustrations & mascot are budgeted** (DESIGN-SYSTEM §11): empty/error/404/onboarding/
  overview-hero only — never headers, nav, or data views; honest (no fabricated data).

## Relevant features
**F-028** (UI foundation) → **F-014** (dashboard), then the R1+ dashboard features (F-027, etc.)
in [`../../.harness/state/feature_list.json`](../../.harness/state/feature_list.json). The
frontend harness itself is **F-033**.

## Frontend harness (use it)
The stack/design are **locked**
([ADR-0009](../../docs/adr/0009-frontend-stack-and-design-system.md),
[`DESIGN-SYSTEM.md`](../../docs/design/DESIGN-SYSTEM.md) + its machine-readable
[manifest](../../docs/design/design-system.manifest.json)). The frontend harness — skills
[`build-ui`](../../.harness/skills/build-ui/SKILL.md),
[`shadcn`](../../.harness/skills/shadcn/SKILL.md),
[`frontend-craft`](../../.harness/skills/frontend-craft/SKILL.md),
[`motion`](../../.harness/skills/motion/SKILL.md), plus the `a11y`/`web-perf` gates — is in place
([ADR-0021](../../docs/adr/0021-frontend-harness-and-design-skill-adaptation.md)). **Start any UI
work with [`build-ui`](../../.harness/skills/build-ui/SKILL.md).**
