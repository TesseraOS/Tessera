# ADR-0008: Brand "Tessera" & `@tessera/*` package scope

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Project lead, Claude
- **Supersedes:** the earlier working name "ContextOS"
- **Tags:** branding, product

## Context

The earlier working name **ContextOS** is taken in our exact market: a live commercial
"Context Engineering Platform" at getcontextos.com, plus open-source projects of the
same name, in a crowded AI-memory/context space. A public name collision with a direct
competitor is a real brand and SEO liability. The neuroscience-flavored alternative
**Engram** is also burned — a well-funded enterprise AI-memory startup (and several
other products, including one literally for "memory for AI coding agents") now own that
term. Package scope is independent of branding, so the rename carries **zero migration
cost** while the repository is still greenfield.

## Decision

- **Public brand: Tessera.** A *tessera* is a single tile in a mosaic — fragments
  assembled into a coherent whole, which is precisely what the Context Compiler does.
  It is short, brandable, and pronounceable.
- **npm package scope: `@tessera/*`** (supersedes `@contextos/*`).
- **`ContextOS` is retained only as an internal codename** in historical notes; all
  new product-facing material uses Tessera.
- Final domain (`.ai` / `.dev` / `.com`) and trademark clearance to be confirmed at the
  registrar/legal step before any public launch; this ADR fixes the *name*, not the TLD.

## Consequences

### Positive
- Clean brand in a crowded category; no direct-competitor name clash.
- Greenfield rename means no code, packages, or imports to migrate.

### Negative / Costs
- Exact domain availability and trademark status still need external verification.
- A few existing internal/memory references say "ContextOS"; reconciled during this
  phase's memory hygiene.

### Neutral / Follow-ups
- Register domain + social handles and run a trademark check before launch.
- If Tessera proves unavailable at the registrar/legal step, fall back to a vetted
  alternative (e.g. Noema) via a superseding ADR — the scope stays decoupled either way.

## Alternatives considered

- **Keep ContextOS** — direct-competitor collision; rejected.
- **Engram** — saturated/funded incumbent in the same niche; rejected.
- **Noema / Cairn / Weft** — viable; held as fallbacks behind Tessera.

## References

- `README.md`, `docs/PRD.md`.
