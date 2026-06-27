# ADR-0009: Frontend stack & design system (and: responsive web, not PWA)

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Project lead, Claude
- **Tags:** frontend, design, web

## Context

The dashboard is a core surface (search, knowledge-graph viz, timelines, the Context
Package inspector, memory/ADR authoring, config, governance). The project lead specified a
rich UI/UX bar (micro-interactions, optimistic updates, ⌘K, virtualization, themes,
accessibility) and provided design references (tweakcn, efferd, coss/ui, ui-skills,
unabyss). We need the foundation **locked now** so UI features build on one consistent
system rather than diverging. Two sub-questions were also open: whether to lock the stack
now (vs at R1) and whether the dashboard should be a **PWA**.

## Decision

**Stack (locked):**
- **Next.js + React + TypeScript** (App Router; Server Components by default).
- **Tailwind CSS + shadcn/ui** (Radix/Base-UI primitives, owned-in-repo components).
- **Design tokens** as semantic CSS variables, authored with **tweakcn**, themed
  light/dark/system.
- **TanStack Query** (server state) + **Zustand** (minimal client state).
- **React Hook Form + Zod** (forms; reuse API schemas).
- **Framer Motion** (functional motion), **React Flow** (graph/architecture), **Monaco**
  (memory/ADR editing), **Recharts/Tremor** (charts).
- Data access only via the generated **`@tessera/sdk`** — no ad-hoc fetch, no business logic
  in the UI.

**Design system:** the binding spec is
[`docs/design/DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md) — principles, tokens, components,
layout, motion, the mandatory UX baseline (PRD FR-49), accessibility (WCAG 2.1 AA), and
performance budgets.

**Responsive web, not a PWA.** The dashboard is a fully responsive, accessible web app. We
will **not** build PWA/offline support: Tessera's offline story is the **local engine**
itself, and a service-worker offline shell adds real complexity (caching live data) for
little value on a control panel.

## Consequences

### Positive
- One consistent, accessible, themeable foundation; UI features compose primitives instead
  of reinventing them.
- Tokens decouple visual design from components; re-theming is a token change.
- Avoids PWA complexity that wouldn't pay off here.

### Negative / Costs
- A broad library set to integrate and keep current; bundle discipline required
  (code-split heavy views — graph, Monaco, charts).
- shadcn components are owned in-repo (we maintain them) — intentional, but it's upkeep.

### Neutral / Follow-ups
- Implemented by **F-028 (UI foundation)** then consumed by **F-014** and later dashboard
  features.
- If an offline/installable need emerges later, revisit PWA via a superseding ADR.

## Alternatives considered

- **Keep the stack "Proposed" until R1** — rejected; the lead asked to lock now for
  consistency, and greenfield means no migration cost.
- **Plain CSS / a component kit other than shadcn** — shadcn + Radix/Base-UI gives
  accessibility + ownership + the tweakcn token workflow the references point to.
- **PWA dashboard** — rejected (see Decision).
- **Material UI / Ant Design** — heavier, more opinionated theming; less aligned with the
  token-driven, tailwind/shadcn references.

## References

- [`docs/design/DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md), `docs/PRD.md` (FR-41/44/49,
  NFR-9), [ADR-0002](0002-backend-framework-fastify.md) (SDK source of truth).
