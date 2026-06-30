# ADR-0023: Adopt efferd Dashboard 3 as the dashboard's binding design reference

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** Project lead, Claude
- **Tags:** frontend, design, web

## Context

The dashboard's look was repeatedly rejected as generic "AI slop." The project lead directed us
to follow a specific, proven reference — **efferd's Dashboard blocks**
(<https://efferd.com/blocks/dashboard>), which are **shadcn/ui blocks** (copy-paste, owned
in-repo) — and to **lock it in the harness** so it can't drift. The lead also asked whether to
switch component libraries (Astryx / Aceternity / coss-ui).

## Decision

**1. Stay on shadcn/ui** (ratifies [ADR-0009](0009-frontend-stack-and-design-system.md) /
[ADR-0021](0021-frontend-harness-and-design-skill-adaptation.md)). efferd, coss-ui, and
shadcnblocks are all **shadcn blocks** — adopting them *is* "import + fine-tune." Aceternity is
for animated marketing pages (wrong category for a data dashboard); Astryx is immature and
off-brand. Industry consensus puts shadcn as the enterprise-dashboard standard (Vercel/Linear/
Stripe).

**2. Bind efferd Dashboard 3** as the concrete design reference, extracted from its actual
registry source (`@efferd/dashboard-3` + `@efferd/app-shell-3`):
- **Dark-first**, near-black canvas; flat **bordered** surfaces (`shadow-none`).
- **Monochrome `--chart-*` ramp**; **emerald-up / red-down** (the `Delta` chip) is the **only**
  functional accent — the UI is otherwise neutral.
- **Lucide** icons; a **mosaic** logo mark (tesserae).
- Shell = shadcn **Sidebar** (inset, collapsible, grouped nav with section labels) + breadcrumb
  header + nav-user.
- Data viz = shadcn **Charts** (Recharts); KPI **stat cards** + `Delta`; **tables** + divided
  lists; **first-class empty states** — no fabricated data (honest zero states until real metrics
  exist).

**3. Enforce via the harness.** [`DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md) §0 is now the
binding reference; the manifest and the `build-ui` / `frontend-craft` skills point at it.
Deviating requires a superseding ADR.

## Consequences

### Positive
- One concrete, proven, enterprise-grade reference; no more ambiguous "taste."
- Owned-in-repo shadcn components; efferd blocks are a copy-in source we can pull as needed.

### Negative / Costs
- A fresh install has no data, so the dashboard leads with empty/onboarding states rather than
  data-rich charts; charts populate once metrics exist.

### Neutral / Follow-ups
- Data-rich chart cards (activity area / breakdown donut / recent table) land as real metrics
  endpoints are added. Pro efferd blocks (7/8/9) can be pulled later with access.

## Alternatives considered
- **Switch to Astryx / Aceternity / coss-ui** — rejected (see Decision #1; wrong category /
  immature / still shadcn underneath).
- **Keep the prior hand-tuned violet theme** — rejected (the look the lead rejected).

## References
- efferd: <https://efferd.com/blocks/dashboard> (`@efferd/dashboard-3`, `@efferd/app-shell-3` —
  shadcn registry), [`DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md) (binding spec).
- [ADR-0009](0009-frontend-stack-and-design-system.md),
  [ADR-0021](0021-frontend-harness-and-design-skill-adaptation.md).
