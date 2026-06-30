# Plan: F-028 UI foundation (design tokens/theming, base shadcn, app shell, command palette)

- **Feature:** F-028 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-49 (UX baseline), NFR-9 (WCAG 2.1 AA)
- **Service / package:** `apps/web` / `@tessera/web`
- **Author:** Claude · **Date:** 2026-06-30

## Intent
Stand up the Next.js dashboard shell every later UI feature composes on: design tokens +
light/dark/system theming, base shadcn/ui components, an app shell (sidebar + topbar), the ⌘K
command palette, and the UX-baseline primitives (skeleton/empty/error, toasts, motion) at a WCAG
AA bar. No data layer yet (the `@tessera/sdk` is F-022/R1; F-014 wires real data) — this is the
foundation only. Built with the [`build-ui`](../skills/build-ui/SKILL.md) skill against
[`DESIGN-SYSTEM.md`](../../docs/design/DESIGN-SYSTEM.md) + its
[manifest](../../docs/design/design-system.manifest.json).

## Approach
Locked stack ([ADR-0009](../../docs/adr/0009-frontend-stack-and-design-system.md)): **Next.js 15
(App Router, RSC) + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui**, `next-themes`,
`framer-motion`, `sonner` (toasts), `cmdk` (via shadcn `Command`), `lucide-react`. Tokens are
**semantic CSS variables** (DESIGN-SYSTEM §2) mapped into Tailwind v4 `@theme`; components use
tokens only. Verified incrementally — keep the workspace green between steps.

Increments:
1. **Scaffold** `apps/web`: `package.json` (next/react/tailwind/test deps; scripts wired to the
   turbo tasks), app-specific `tsconfig.json` (Next needs `moduleResolution: bundler`, `jsx`,
   `noEmit`; keep `strict` + repo strict flags), `next.config.ts`, `postcss`, eslint flat config
   extending root + `next`/react-hooks/jsx-a11y, `.gitignore` (`.next`), `app/` skeleton.
2. **Tokens + theming**: `app/globals.css` with all semantic color roles (light + `.dark`),
   radius/typography/spacing, Tailwind v4 `@theme inline` mapping; `ThemeProvider` (next-themes,
   `system` default) + `ThemeToggle`. Token values seeded from a tweakcn-style neutral base
   (refined later).
3. **Base shadcn components** (owned in-repo under `components/ui/`): button, card, input,
   dialog, dropdown-menu, command, sheet, tooltip, skeleton, badge, separator, sonner; `lib/cn`.
4. **App shell**: collapsible sidebar (`--sidebar-*` tokens) + topbar (search trigger, theme
   toggle, user/org placeholder — auth is R2), responsive (sidebar → sheet/drawer on mobile),
   skip-link + landmarks.
5. **Command palette (⌘K)**: global shortcut, grouped actions (nav + theme), keyboard operable.
6. **State primitives**: `EmptyState`, `ErrorState`, `Skeleton` patterns, `Toaster` wired; a demo
   home page that exercises them.
7. **Motion primitives**: `lib/motion` variants (fade/slide) that honor `prefers-reduced-motion`.
8. **Tests**: Vitest + React Testing Library + jsdom (theme toggle, ⌘K open/close, empty/error
   render); Playwright + `@axe-core/playwright` e2e (home renders, ⌘K opens, theme switch, **axe
   AA scan = the `a11y` gate**).
9. **Activate web gates**: flip `a11y` + `web-perf` from `planned` → `active` in
   [`gates.json`](../verification/gates.json) wired to web scripts; add `.next` to turbo build
   outputs.

## Files to touch
- `apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`,
  `eslint.config.mjs`, `.gitignore`, `playwright.config.ts`, `vitest.config.ts`,
  `vitest.setup.ts` — app + tooling.
- `apps/web/app/{layout.tsx,page.tsx,globals.css}`, `app/providers.tsx` — shell + tokens.
- `apps/web/components/ui/*` — base shadcn primitives (owned in-repo).
- `apps/web/components/{app-shell,sidebar,topbar,theme-toggle,command-palette,empty-state,error-state}.tsx`.
- `apps/web/lib/{cn.ts,motion.ts}`.
- `apps/web/tests/e2e/*` — Playwright + axe.
- Root: `turbo.json` (add `.next/**` to build outputs), `.harness/verification/gates.json`
  (activate web gates), `pnpm-lock.yaml`.

## Anticipated effects
- **E-004** (this feature's effect — the dashboard UI foundation) realized; **F-014** consumes
  the shell/primitives. No backend contract changes (no SDK yet) → no cross-package effect on
  api/domain. New web verification gates affect CI (effect E-005, the gate set).

## Test plan
- **Unit/component** (Vitest + RTL + jsdom): theme toggle switches `.dark`; command palette opens
  on ⌘K and lists actions; `EmptyState`/`ErrorState` render their slots; cn util.
- **E2E** (Playwright): home renders shell (sidebar+topbar); ⌘K opens/closes; theme persists;
  **axe** scan passes WCAG AA on home + palette-open.

## Verification
Gates (evidence captured): `state` · `typecheck` · `lint` · `format` · `test` · `build`
(`next build`) · `test:e2e` (Playwright) incl. **`a11y`** (axe). Capture pass output per
[verification protocol](../protocols/verification.md).

## Risks / open questions
- **Dependency install / network** — Next/React/Tailwind/Playwright must install; verify registry
  reachability before scaffolding. Playwright browser download may need `--with-deps` / cache.
- **Strict TS vs Next** — Next needs `moduleResolution: bundler` + `jsx`; app tsconfig overrides
  base's `NodeNext` while keeping `strict` + repo strict flags. `verbatimModuleSyntax` kept (use
  `import type`).
- **Tailwind v4 + shadcn** — use the v4 CSS-first `@theme`; shadcn components target v4.
- **Build cost** — `next build` is heavier than `tsc`; acceptable, cache off (matches repo).
- No new ADR needed — ADR-0009 + DESIGN-SYSTEM.md govern; version picks (Next 15/Tailwind v4) are
  latest-stable within the locked stack.
