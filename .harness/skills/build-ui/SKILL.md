---
name: build-ui
description: Build a Tessera dashboard (apps/web) UI feature end-to-end — server-first, tokens-only, shadcn-composed, with the mandatory UX baseline, provenance, motion, and accessibility. Frontend companion to add-feature.
---

# Skill: build-ui

The orchestration skill for any UI work in `apps/web` (F-028, F-014, later dashboard
features). It sequences the frontend sub-skills and enforces the binding design system. Use it
whenever you add or change a screen, component, or interaction.

> This does not replace [`add-feature`](../add-feature/SKILL.md) (the global feature loop) — it
> specializes the **implement** step for the dashboard. Plan → implement → verify → trace →
> record still applies.

## Authorities (read before coding)
- **Design system (binding):** [`docs/design/DESIGN-SYSTEM.md`](../../../docs/design/DESIGN-SYSTEM.md)
  — the single source of truth for look, feel, interaction. Its machine-readable projection is
  [`design-system.manifest.json`](../../../docs/design/design-system.manifest.json) (token
  roles, component inventory, motion params, budgets) — consult it to stay in-contract.
- **Stack (locked):** [ADR-0009](../../../docs/adr/0009-frontend-stack-and-design-system.md) —
  Next.js + Tailwind + shadcn/ui + TanStack Query + Zustand + RHF/Zod + Framer Motion.
- **Rules:** [`rules/frontend`](../../rules/frontend/frontend.md) +
  [`apps/web/.harness/rules/frontend.md`](../../../apps/web/.harness/rules/frontend.md).

## The loop (UI specialization)
1. **Compose, don't reinvent.** Reach for a shadcn primitive first →
   [`shadcn`](../shadcn/SKILL.md). One component per job.
2. **Tokens only.** Never hardcode color/spacing/radius/shadow — use the semantic CSS variables
   in the manifest. Light/dark/system must all work; never branch on theme in components.
3. **Server-first.** Server Components by default; `"use client"` only where interactivity
   needs it. Data via the generated `@tessera/sdk` + TanStack Query — no ad-hoc fetch, no
   business logic in the UI.
4. **Craft the layout.** Apply [`frontend-craft`](../frontend-craft/SKILL.md) for typography,
   spacing rhythm, and restraint (anti-slop) — within our "restraint over richness" principle.
5. **Motion with intent.** Apply [`motion`](../motion/SKILL.md) — functional, fast,
   interruptible, `prefers-reduced-motion`-safe.
6. **Provenance-first.** Any surface showing context shows sources/scores/"why included" (e.g.
   the Context Package inspector). This is Tessera's signature — never an unexplained result.

## UX baseline checklist (FR-49 — a feature is NOT done without these)
- [ ] Loading **skeleton**, **empty**, and **error** states on every async surface
- [ ] **⌘K command palette** + keyboard operability; visible focus rings
- [ ] **Optimistic updates** with rollback where it helps perceived speed
- [ ] **Toasts** for async outcomes
- [ ] **Virtualized** long lists/tables (no eager render of large sets)
- [ ] **Light / dark / system** themes via tokens
- [ ] Purposeful **motion**; honors `prefers-reduced-motion`
- [ ] Drag-and-drop / context menus where they aid the task

## Verification (UI gates)
- Standard code gates (typecheck/lint/format/test/build) + **e2e** (Playwright).
- **Accessibility is a gate** (NFR-9, WCAG 2.1 AA): run axe in e2e; semantic HTML, labelled
  controls, managed focus, AA contrast, full keyboard paths.
- **Performance budget:** code-split heavy views (React Flow, Monaco, charts); measure bundle
  with evidence. See gates `a11y` / `web-perf` in
  [`verification/gates.json`](../../verification/gates.json).
