# Tessera — Design System

| Field | Value |
|-------|-------|
| **Status** | Draft v1.0 — Phase B.1 |
| **Last updated** | 2026-06-27 |
| **Authority** | [ADR-0009](../adr/0009-frontend-stack-and-design-system.md) (frontend stack & design foundation) |
| **Enforced by** | [`.harness/rules/frontend/frontend.md`](../../.harness/rules/frontend/frontend.md), [`apps/web/.harness/rules/frontend.md`](../../apps/web/.harness/rules/frontend.md) |

> This is the **single source of truth for the dashboard's look, feel, and interaction**.
> Every UI feature (starting F-028 UI foundation, then F-014) must conform. It operationalizes
> the UI/UX requirements in [`../PRD.md`](../PRD.md) (FR-49, NFR-9) and the references the
> project lead provided (see [§10](#10-references)).

---

## 1. Design principles

Distilled from the reference set (unabyss, ui-skills, coss/ui, efferd) into rules we hold:

1. **Restraint over richness.** Minimal decoration; hide complexity until needed
   (progressive disclosure). Functional clarity beats ornamentation.
2. **Legibility as luxury.** Generous whitespace, clear typographic hierarchy, high
   contrast. The user should grasp a screen at a glance.
3. **Functional motion.** Motion communicates state and causality — never decoration for
   its own sake. Fast, interruptible, and respects `prefers-reduced-motion`.
4. **Trust through consistency.** Repeated patterns, one component per job, predictable
   behavior. Accessibility and keyboard parity are architectural, not afterthoughts.
5. **Provenance-first.** Tessera's value is explainability — any surface that shows context
   must show *where it came from and why* (sources, scores). This is our signature.
6. **Performance is a feature.** Perceived speed (optimistic UI, skeletons, virtualization)
   and real speed (code-splitting, streaming) are part of the design, not an afterthought.

## 2. Foundations — design tokens

We theme **shadcn/ui via semantic CSS variables**, authored with **[tweakcn](https://tweakcn.com/editor/theme)**
and exported into the app. **Components never hardcode colors/spacing — only tokens.**

### 2.1 Color (semantic roles, light + dark)
Each role has a background and a foreground (text-on) pairing:

| Token | Use |
|-------|-----|
| `--background` / `--foreground` | app canvas + default text |
| `--card` / `--card-foreground` | surfaces, panels |
| `--popover` / `--popover-foreground` | overlays, menus |
| `--primary` / `--primary-foreground` | primary actions, brand |
| `--secondary` / `--secondary-foreground` | secondary actions |
| `--muted` / `--muted-foreground` | subtle backgrounds, secondary text |
| `--accent` / `--accent-foreground` | highlights, hover states |
| `--destructive` / `--destructive-foreground` | dangerous/irreversible actions |
| `--border`, `--input`, `--ring` | borders, field borders, focus rings |
| `--chart-1` … `--chart-5` | data-viz categorical palette |
| `--sidebar-*` | sidebar surface tokens (bg/fg/primary/accent/border/ring) |

- **Themes:** light / dark / **system** (default), toggled via a `.dark` class on `:root`;
  all roles defined for both. Never branch on theme in components — use the tokens.
- **Contrast:** every text/background pairing meets WCAG AA (≥ 4.5:1 body, ≥ 3:1 large).

### 2.2 Radius, typography, spacing, elevation
- **Radius:** single `--radius` base with derived `sm/md/lg/xl` — consistent rounding.
- **Typography:** one sans font family (display + body); a defined type scale
  (e.g. `xs→3xl`) with set weights and line-heights; **monospace** for code/IDs/provenance.
- **Spacing:** Tailwind's 4px-based scale; consistent component padding rhythm.
- **Elevation:** a small, fixed shadow set (`sm/md/lg`); avoid arbitrary shadows.
- **Z-index & breakpoints:** a documented z-index ladder (base → dropdown → sticky →
  overlay → toast) and Tailwind breakpoints; no magic numbers.

## 3. Component system

Built on **shadcn/ui** (Radix/Base-UI primitives + Tailwind) — accessible, composable,
owned-in-repo components. Categories we standardize:

- **Forms (composable hierarchy):** `Field` / `Fieldset` / `Form` over atomic `Input`,
  `Textarea`, `Checkbox`, `RadioGroup`, `Select`, `Switch`, `Slider`. Validation with
  **React Hook Form + Zod** (reuse API schemas where possible).
- **Overlays (granular depth):** `Dialog`, `Drawer`/`Sheet`, `Popover`, `Tooltip`,
  `ContextMenu`, `DropdownMenu`, and the **Command palette (⌘K)**. Pick the lightest overlay
  that fits; manage focus and escape consistently.
- **Data display:** `Table` (**virtualized** for large sets), `Card`, `Badge`, `Progress`,
  charts via **Recharts/Tremor** (using the `--chart-*` palette), `Tabs`, `Accordion`.
- **Feedback & states:** `Toast` (notifications), `Skeleton` (loading), and first-class
  **empty** and **error** states for every async surface.
- **Specialized:** **React Flow** (knowledge graph / architecture), **Monaco** (memory/ADR
  editing) — both lazy-loaded.

> One component per job. Don't build a bespoke widget where a primitive composes.

## 4. Layout patterns

From the efferd dashboard reference, the app shell and dashboard conventions:

- **App shell:** persistent **sidebar** (collapsible, `--sidebar-*` tokens) + **top bar**
  (search, ⌘K, theme toggle, user/org). Content region scrolls independently.
- **Dashboard composition:** **KPI/stat header**, **card grids** (modular, multi-column),
  charts (area/line/pie/sparkline), activity feeds, attention lists.
- **Controls:** **time-range / date toolbars** for temporal filtering without navigation.
- **Density:** support both **dense** (many metrics) and **sparse** (focused) views.
- **Responsive:** fluid down to tablet/mobile widths; sidebar collapses to a drawer; grids
  reflow. (Responsive web — **not** a PWA; see ADR-0009.)

## 5. Interaction & motion

Motion via **Framer Motion**, governed by the "functional motion" principle:

- **Micro-interactions:** hover/press/focus feedback, subtle state transitions.
- **Page/route transitions:** quick, consistent; no janky reflow.
- **Optimistic updates:** reflect the user's action immediately, reconcile/rollback on the
  server response (TanStack Query mutations).
- **Drag-and-drop & context menus** where they speed real tasks (not novelty).
- **Loading sequences:** skeletons over spinners; stream/stagger content in.
- **Rules:** animations are fast (~150–250ms), interruptible, and **disabled under
  `prefers-reduced-motion`**.

## 6. UX baseline (mandatory — PRD FR-49)

Every relevant surface ships these; a UI feature is **not done** without them:

- [ ] Loading (**skeleton**), **empty**, and **error** states
- [ ] **Optimistic updates** with rollback where it helps perceived speed
- [ ] **Toasts** for async outcomes
- [ ] **Command palette (⌘K)** + keyboard shortcuts; full keyboard operability
- [ ] **Virtualized** long lists/tables
- [ ] **Drag-and-drop** and **context menus** where they aid the task
- [ ] **Real-time updates** (SSE/WebSocket) reflected in the UI
- [ ] Light / dark / **system** themes
- [ ] High-performance rendering (no eager render of large sets)

## 7. Provenance-first surfaces (Tessera signature)

- **Context Package inspector (FR-44):** render the compilation trace — stages, candidates,
  scores, drops, and per-fragment **"why included"** with source links. This is the flagship
  screen.
- **Knowledge graph / architecture (React Flow):** explorable nodes/edges incl. effect-links.
- **Timelines:** changes / decisions / incidents over time.
- **Memory & ADR authoring (Monaco):** edit with live validation.
Any view that surfaces context shows its **sources and scores** — no unexplained results.

## 8. Accessibility (NFR-9 — WCAG 2.1 AA, a verification gate)

Semantic HTML; every control labelled; managed focus order; **visible focus rings**
(`--ring`); AA contrast on all token pairings; full keyboard paths (incl. overlays and the
command palette); `prefers-reduced-motion` honored; screen-reader-tested critical flows.
Accessibility checks (e.g. axe) run in the web E2E gate.

## 9. Performance budgets

- **Code-split & lazy-load** heavy views (React Flow graph, Monaco, charts).
- **Virtualize** large tables/lists.
- Stream/SSR where it improves first paint; keep the initial bundle lean (measure with
  evidence — Lighthouse/bundle analysis in CI).
- Data via the generated **`@tessera/sdk` + TanStack Query**; cache and dedupe requests.

## 10. References

Provided by the project lead, used to ground this system:
- Theming/tokens: <https://tweakcn.com/editor/theme>
- Dashboard blocks/layout: <https://efferd.com/blocks/dashboard>
- UI components/conventions: <https://coss.com/ui>
- UI/UX skills & micro-interactions: <https://www.ui-skills.com/>
- Premium aesthetic reference: <https://unabyss.com/>
- Foundations: shadcn/ui, Radix/Base UI, Tailwind CSS.
