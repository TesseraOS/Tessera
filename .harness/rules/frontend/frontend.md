# Rule: Frontend / Dashboard

Applies to `apps/web`. Stack and design foundation are **locked** in
[ADR-0009](../../../docs/adr/0009-frontend-stack-and-design-system.md): Next.js + React +
TypeScript + Tailwind + shadcn/ui (+ TanStack Query, Zustand, React Hook Form + Zod, Framer
Motion, React Flow, Monaco, Recharts/Tremor).

> **Binding design system.** All UI conforms to
> [`docs/design/DESIGN-SYSTEM.md`](../../../docs/design/DESIGN-SYSTEM.md). Use **design
> tokens** (semantic CSS variables) only — never hardcode colors/spacing/radius. It is
> implemented first by **F-028 (UI foundation)** and consumed by every later UI feature.

## Architecture
- Prefer **Server Components**; make client components only when interactivity requires it.
- Data fetching via the generated **`@tessera/sdk`** + TanStack Query; never hand-roll
  fetch calls scattered across components. No business logic in the UI — call the API.
- State: server state in TanStack Query; minimal client state in Zustand; forms with React
  Hook Form + Zod (same schemas as the API where possible).

## UX baseline (PRD FR-49 — required, not optional)
- Every async surface has **loading (skeleton), empty, and error** states.
- **Optimistic updates** with rollback where it improves perceived speed.
- **Command palette (⌘K)**, keyboard operability, toasts for feedback.
- **Virtualized** long lists/tables; no rendering thousands of rows eagerly.
- Tasteful **micro-interactions** (Framer Motion) — purposeful, not decorative.
- Light / dark / system modes × the DESIGN-SYSTEM §0.1 theme catalog (ADR-0047) —
  components are token-only and never branch on theme or mode.

## Accessibility (NFR-9 — WCAG 2.1 AA)
- Semantic HTML, labelled controls, focus management, visible focus rings, sufficient
  contrast, full keyboard paths. Accessibility is a verification gate for UI features.
- Contrast is governed by [`contrast.md`](contrast.md) (≥ 4.5:1 body, ≥ 3:1 large/non-text,
  across every theme × mode) and enforced executably — see the
  [`contrast-checker`](../../skills/contrast-checker/SKILL.md) skill.

## Performance
- Mind bundle size (code-split, lazy-load heavy views like the graph/Monaco); measure with
  evidence. Stream where it helps first paint.

## Provenance-first UX
- Tessera's value is explainability — surfaces that show context **must show provenance**
  (sources, scores, "why included"), e.g. the Context Package inspector (FR-44).
