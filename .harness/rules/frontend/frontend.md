# Rule: Frontend / Dashboard

Applies to `apps/web`. Stack: Next.js + React + TypeScript + Tailwind + shadcn/ui.
(A dedicated frontend ADR is due at R1; until then these rules + the PRD UX baseline apply.)

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
- Light / dark / system themes.

## Accessibility (NFR-9 — WCAG 2.1 AA)
- Semantic HTML, labelled controls, focus management, visible focus rings, sufficient
  contrast, full keyboard paths. Accessibility is a verification gate for UI features.

## Performance
- Mind bundle size (code-split, lazy-load heavy views like the graph/Monaco); measure with
  evidence. Stream where it helps first paint.

## Provenance-first UX
- Tessera's value is explainability — surfaces that show context **must show provenance**
  (sources, scores, "why included"), e.g. the Context Package inspector (FR-44).
