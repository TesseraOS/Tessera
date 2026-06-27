# Plan: <F-00x> <feature title>

- **Feature:** F-00x (link to entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-*, NFR-* (from [`../../docs/PRD.md`](../../docs/PRD.md))
- **Service / package:** apps/… , @tessera/…
- **Author:** <agent/human> · **Date:** YYYY-MM-DD

## Intent
What this feature delivers and why (1–3 sentences). What "done" looks like for a user.

## Approach
The design in brief. Which ports/utilities are **reused**. New types/interfaces. Sequence of
small, verifiable increments.

## Files to touch
- `path/…` — what changes and why.

## Anticipated effects
Shared contracts this may change and their known dependents (feeds the
[effect-link protocol](../protocols/effect-link.md)). e.g. "changes `VectorStore` port ⇒
both adapters + conformance suite."

## Test plan
- Unit: …
- Integration / conformance: …
- E2E (if user-facing): …

## Verification
Exact gates to run and the evidence to capture
([verification protocol](../protocols/verification.md)).

## Risks / open questions
Anything uncertain; any `OQ*` that must be resolved (ADR) before/within this work.
